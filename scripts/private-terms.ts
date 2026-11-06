import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseInteger } from '../src/utils/parse.js';
import { gitBytes, revisionExists } from './git.js';
import { ALLOWED_PHRASE_HASHES, KEYED_TERM_HASHES, PRIVATE_TERM_HASHES } from './private-terms-hashes.js';

export { ALLOWED_PHRASE_HASHES, KEYED_TERM_HASHES, PRIVATE_TERM_HASHES } from './private-terms-hashes.js';

/**
 * The guard stores a term as the hash of a normalized phrase of at most this
 * many words, and `findPrivateTerms` hashes n-grams up to this bound on every
 * scanned line. A real term longer than this is covered by overlapping
 * sub-phrases whose windows span every word, so each occurrence still matches
 * one of them. Raising the bound multiplies the work each scanned line costs,
 * so it stays at the smallest bound the corpus needs.
 */
export const MAX_WORDS = 4;

/**
 * A pt-BR number: thousands dots with an optional comma, or a comma decimal.
 * The trailing guard rejects a longer number (a digit, or a separator followed
 * by one) but not sentence punctuation, so `R$ 1.234,56.` still matches.
 */
const FORMATTED_NUMBER =
  /(?<![\d.,])\d{1,3}(?:\.[0-9]{3})+(?:,[0-9]{1,2})?(?!\d|[.,]\d)|(?<![\d.,])\d+(?:,\d+)+(?!\d|[.,]\d)/g;

const WHOLE_FORMATTED_NUMBER = new RegExp(`^(?:${FORMATTED_NUMBER.source})$`);

/**
 * True when `text` is exactly one pt-BR number, separators included. The
 * corpus check uses it to cover a value whose tokens the guard stores in
 * another spelling (`1.234,56` is `1234 56` in the hash set).
 */
export function isFormattedNumber(text: string): boolean {
  return WHOLE_FORMATTED_NUMBER.test(text.trim().replace(/\\([.,])/g, '$1'));
}

/** Lowercase, accent-free words separated by one space. */
export function normalizeTerm(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const NORMALIZED_HASH_CACHE = new Map<string, string>();

function hashNormalized(normalized: string): string {
  const cached = NORMALIZED_HASH_CACHE.get(normalized);
  if (cached !== undefined) return cached;
  const hash = createHash('sha256').update(normalized).digest('hex');
  NORMALIZED_HASH_CACHE.set(normalized, hash);
  return hash;
}

export function termHash(term: string): string {
  return hashNormalized(normalizeTerm(term));
}

/**
 * The key that turns a low-entropy numeric term into a keyed hash. It lives
 * outside the repository (the maintainer's `~/.mdcli-team/private-terms.key`
 * and the CI secret), so the public hash set reveals nothing without it.
 * Absent, the guard skips numeric terms and says so instead of pretending it
 * checked them.
 */
export function privateTermsKey(): string | undefined {
  const key = process.env.MDCLI_PRIVATE_TERMS_KEY?.trim();
  return key === undefined || key === '' ? undefined : key;
}

/**
 * The key, or a loud failure when the environment requires it (#221). CI sets
 * `MDCLI_REQUIRE_PRIVATE_TERMS_KEY=1` for a same-repository run, so a missing
 * secret fails the guard instead of leaving numeric terms silently unchecked.
 * A fork PR cannot read the secret and keeps the warn-and-skip path.
 */
export function requirePrivateTermsKey(): string | undefined {
  const key = privateTermsKey();
  if (key === undefined && process.env.MDCLI_REQUIRE_PRIVATE_TERMS_KEY === '1') {
    throw new Error(
      'MDCLI_PRIVATE_TERMS_KEY is required (MDCLI_REQUIRE_PRIVATE_TERMS_KEY=1) but unset; low-entropy numeric terms cannot be verified'
    );
  }
  return key;
}

/** True when an already-normalized term is only digits, such as an id or an amount. */
export function isNumericTerm(normalized: string): boolean {
  return /^\d+(?: \d+)*$/.test(normalized);
}

const KEYED_HASH_CACHE = new Map<string, string>();

function keyedHashNormalized(normalized: string, key: string): string {
  const cacheKey = `${key}\u0000${normalized}`;
  const cached = KEYED_HASH_CACHE.get(cacheKey);
  if (cached !== undefined) return cached;
  const hash = createHmac('sha256', key).update(normalized).digest('hex');
  KEYED_HASH_CACHE.set(cacheKey, hash);
  return hash;
}

export function keyedTermHash(term: string, key: string): string {
  return keyedHashNormalized(normalizeTerm(term), key);
}

/**
 * A guarded number can be written as `1234.56`, `1.234,56` or `7.654,5`, so
 * every spelling of the same value is tried against the hashes.
 */
export function formattedNumberCandidates(text: string): string[] {
  const candidates: string[] = [];
  // Tests assert amounts through regex literals, where the separator is
  // escaped (`1\.234,56`); read the escaped spelling as the same number.
  const unescaped = text.replace(/\\([.,])/g, '$1');
  for (const cluster of unescaped.match(FORMATTED_NUMBER) ?? []) {
    const groups = cluster.split(/[.,]/);
    const head = groups.slice(0, -1).join('');
    const cents = groups[groups.length - 1]!;
    candidates.push(groups.join(''), head, `${head} ${cents}`);
    const trimmed = cents.replace(/0+$/, '');
    if (trimmed) candidates.push(`${head} ${trimmed}`);
  }
  return candidates;
}

/** Hashes of the guarded terms found in `text`, up to four words each. */
export function findPrivateTerms(
  text: string,
  terms: ReadonlySet<string> = PRIVATE_TERM_HASHES,
  allowed: ReadonlySet<string> = ALLOWED_PHRASE_HASHES,
  keyed: ReadonlySet<string> = KEYED_TERM_HASHES,
  key: string | undefined = privateTermsKey()
): string[] {
  const hits = new Set<string>();
  // A keyed term is numeric by construction, so only a numeric n-gram pays for
  // the HMAC; the rest of the tree keeps the unsalted scan's cost.
  const keyedHit = (normalized: string): string | undefined => {
    if (key === undefined || keyed.size === 0 || !isNumericTerm(normalized)) return undefined;
    const hash = keyedHashNormalized(normalized, key);
    return keyed.has(hash) ? hash : undefined;
  };
  for (const candidate of formattedNumberCandidates(text)) {
    const hash = termHash(candidate);
    if (allowed.has(hash)) continue;
    if (terms.has(hash)) hits.add(hash);
    else {
      const keyedHash = keyedHit(normalizeTerm(candidate));
      if (keyedHash !== undefined) hits.add(keyedHash);
    }
  }
  const tokens = normalizeTerm(text).split(' ').filter(Boolean);
  // Only a hit needs this check, so the scan does not hash every n-gram twice.
  const insideAllowed = (start: number, end: number): boolean => {
    for (let n = end - start; n <= MAX_WORDS; n++) {
      for (let from = Math.max(0, end - n); from <= start && from + n <= tokens.length; from++) {
        if (allowed.has(hashNormalized(tokens.slice(from, from + n).join(' ')))) return true;
      }
    }
    return false;
  };
  for (let i = 0; i < tokens.length; i++) {
    const max = Math.min(MAX_WORDS, tokens.length - i);
    for (let n = 1; n <= max; n++) {
      const joined = tokens.slice(i, i + n).join(' ');
      const hash = hashNormalized(joined);
      if (terms.has(hash)) {
        if (!insideAllowed(i, i + n)) hits.add(hash);
        continue;
      }
      const keyedHash = keyedHit(joined);
      if (keyedHash !== undefined && !insideAllowed(i, i + n)) hits.add(keyedHash);
    }
  }
  return [...hits];
}

/**
 * Lines of `text` that contain a guarded term. The binary cell of a bitmask
 * table row is blanked before scanning because it can match a short numeric id
 * by coincidence; the rest of the row is still checked.
 */
export function scanText(
  text: string,
  terms: ReadonlySet<string> = PRIVATE_TERM_HASHES,
  allowed: ReadonlySet<string> = ALLOWED_PHRASE_HASHES,
  keyed: ReadonlySet<string> = KEYED_TERM_HASHES,
  key: string | undefined = privateTermsKey()
): number[] {
  const lines: number[] = [];
  for (const [index, line] of text.split('\n').entries()) {
    const withoutBitmask = line.replace(/^(\|\s*\d+\s*\|\s*)[01]{4}(\s*\|)/, '$1    $2');
    if (findPrivateTerms(withoutBitmask, terms, allowed, keyed, key).length > 0) lines.push(index + 1);
  }
  return lines;
}

export interface PrivateTermHit {
  file: string;
  /** Absent when the hit is the file's path rather than a line of its content. */
  line?: number;
}

/**
 * A blob above this size is not scanned. The guard fails loudly on it instead
 * of skipping it: a silent skip is a hole pretending to be a check (#217).
 */
const MAX_SCAN_BYTES = 1_000_000;

type TreeEntry = { type: string; object: string; path: string };

/** Entries of `ref`'s tree, with their raw paths, as `-z` leaves them unquoted. */
function commitEntries(root: string, ref: string): TreeEntry[] {
  const listed = gitBytes(['ls-tree', '-r', '-z', '--full-tree', ref], root).toString();
  const entries: TreeEntry[] = [];
  for (const record of listed.split('\0')) {
    if (record === '') continue;
    const tab = record.indexOf('\t');
    const [, type, object] = record.slice(0, tab).split(' ');
    if (type === undefined || object === undefined) throw new Error(`unexpected git ls-tree record: ${record}`);
    entries.push({ type, object, path: record.slice(tab + 1) });
  }
  return entries;
}

/** Raw bytes of every blob, one `git cat-file --batch` for the whole tree. */
function blobContents(root: string, objects: string[]): Map<string, Buffer> {
  const contents = new Map<string, Buffer>();
  if (objects.length === 0) return contents;
  const output = gitBytes(['cat-file', '--batch'], root, Buffer.from(`${objects.join('\n')}\n`));
  let offset = 0;
  for (const object of objects) {
    const newline = output.indexOf(0x0a, offset);
    if (newline === -1) throw new Error(`git cat-file output ended early at ${object}`);
    const header = output.subarray(offset, newline).toString();
    const [hash, type, sizeText] = header.split(' ');
    const size = parseInteger(sizeText ?? '');
    if (hash !== object || type !== 'blob' || size === undefined) {
      throw new Error(`unexpected git cat-file header: ${header}`);
    }
    offset = newline + 1;
    contents.set(object, output.subarray(offset, offset + size));
    offset += size + 1;
  }
  return contents;
}

/** Entries of the index (`git ls-files -s`), which holds the staged content. */
function indexEntries(root: string): TreeEntry[] {
  const entries: TreeEntry[] = [];
  for (const record of gitBytes(['ls-files', '-s', '-z'], root).toString().split('\0')) {
    if (record === '') continue;
    const tab = record.indexOf('\t');
    const [mode, object, stage] = record.slice(0, tab).split(' ');
    if (mode === undefined || object === undefined || stage === undefined) throw new Error(`unexpected git ls-files record: ${record}`);
    entries.push({ type: mode === '160000' ? 'commit' : 'blob', object, path: record.slice(tab + 1) });
  }
  return entries;
}

/** Hits from `entries`: their paths and, for blobs not already read, their content. */
function scanEntries(
  root: string,
  entries: TreeEntry[],
  terms: ReadonlySet<string>,
  allowed: ReadonlySet<string>,
  keyed: ReadonlySet<string>,
  key: string | undefined,
  seen: Set<string>
): PrivateTermHit[] {
  const hits: PrivateTermHit[] = entries.flatMap((entry) =>
    findPrivateTerms(entry.path, terms, allowed, keyed, key).length > 0 ? [{ file: entry.path }] : []
  );
  const blobs = entries.filter((e) => e.type === 'blob' && !/^0+$/.test(e.object) && !seen.has(e.object));
  const objects = [...new Set(blobs.map((blob) => blob.object))];
  for (const object of objects) seen.add(object);
  const contents = blobContents(root, objects);
  for (const blob of blobs) {
    const content = contents.get(blob.object);
    if (content === undefined) throw new Error(`missing blob ${blob.object} for ${blob.path}`);
    if (content.length > MAX_SCAN_BYTES) {
      throw new Error(`private-terms: ${blob.path} is ${content.length} bytes, above the ${MAX_SCAN_BYTES}-byte scan limit`);
    }
    // UTF-8 keeps an accented term intact and turns a binary byte into a
    // separator, so the ASCII a term normalizes to is still matched.
    for (const line of scanText(content.toString('utf8'), terms, allowed, keyed, key)) hits.push({ file: blob.path, line });
  }
  return hits;
}

/**
 * Hits from the working-tree copy of each tracked path that differs from the
 * index. A file deleted from disk is skipped because the commit and the index
 * still carry it.
 */
function worktreeHits(
  root: string,
  terms: ReadonlySet<string>,
  allowed: ReadonlySet<string>,
  keyed: ReadonlySet<string>,
  key: string | undefined
): PrivateTermHit[] {
  const hits: PrivateTermHit[] = [];
  for (const path of gitBytes(['diff', '--name-only', '-z'], root).toString().split('\0').filter(Boolean)) {
    let content: Buffer;
    try {
      content = readFileSync(join(root, path));
    } catch {
      continue;
    }
    if (content.length > MAX_SCAN_BYTES) continue;
    for (const line of scanText(content.toString('utf8'), terms, allowed, keyed, key)) hits.push({ file: path, line });
  }
  return hits;
}

/**
 * Private terms in the published commit (`ref`, HEAD by default), the index
 * and the working-tree copy of every tracked path. The commit catches a term
 * whose file was deleted from disk after being committed; the index catches a
 * term that is only staged; the working tree catches an edit not staged yet.
 * A committed blob above the size limit fails the guard instead of being
 * skipped.
 */
export function scanTrackedFiles(
  root: string = join(import.meta.dirname, '..'),
  terms: ReadonlySet<string> = PRIVATE_TERM_HASHES,
  allowed: ReadonlySet<string> = ALLOWED_PHRASE_HASHES,
  ref = 'HEAD',
  keyed: ReadonlySet<string> = KEYED_TERM_HASHES,
  key: string | undefined = privateTermsKey()
): PrivateTermHit[] {
  const seen = new Set<string>();
  const commit = ref === 'HEAD' && !revisionExists(ref, root) ? [] : commitEntries(root, ref);
  const hits = [
    ...scanEntries(root, commit, terms, allowed, keyed, key, seen),
    ...scanEntries(root, indexEntries(root), terms, allowed, keyed, key, seen),
    ...worktreeHits(root, terms, allowed, keyed, key),
  ];
  const found = new Map<string, PrivateTermHit>();
  for (const hit of hits) found.set(`${hit.file}\u0000${hit.line ?? ''}`, hit);
  return [...found.values()];
}

