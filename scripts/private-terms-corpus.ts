import { join } from 'node:path';
import { EXCUSED_REMOVED_TERMS } from './private-terms-excused.js';
import {
  ALLOWED_PHRASE_HASHES,
  MAX_WORDS,
  PRIVATE_TERM_HASHES,
  findPrivateTerms,
  isFormattedNumber,
  normalizeTerm,
  termHash,
} from './private-terms.js';

export interface DeletedLine {
  file: string;
  line: number;
  text: string;
}

export interface RemovedTermHit extends DeletedLine {
  hash: string;
}

/** Files whose contents are dependency metadata, never account data. */
const SKIP_FILE = [
  /(^|\/)(?:bun\.lockb?|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|package\.json)$/,
  /(^|\/)REVIEW-[^/]*\.md$/,
];

/** A full git object id, or a short one that names the same content. */
const CONTENT_HASH = /^[0-9a-f]{32,64}$/;
const SHORT_HASH = /^[0-9a-f]{7,12}$/;
const GIT_ID_CONTEXT = /["']?(?:origin|commit|base|sha|readme-blob)["']?\s*[:@]\s*["']?([0-9a-f]{7,12})\b/i;

/** Words are letters or digits; `12345` and `São` stay one token. */
const WORD = /[\p{L}\p{N}]+/gu;

/** Files that maintain the private-data guard; a change here needs the corpus. */
const GUARD_FILES = [
  'scripts/private-terms.ts',
  'scripts/private-terms-cli.ts',
  'scripts/private-terms-excused.ts',
  'scripts/private-terms-corpus.ts',
  'test/private-terms.test.ts',
  'test/private-terms-corpus.test.ts',
];

interface Token {
  value: string;
  raw: string;
  start: number;
  end: number;
  camel: boolean;
  number: boolean;
  digit: boolean;
  nonAscii: boolean;
}

export interface HeadCorpus {
  readonly tokens: ReadonlySet<string>;
  readonly lines: readonly string[];
  readonly linesByToken: ReadonlyMap<string, readonly number[]>;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(WORD)) {
    const raw = match[0];
    const value = normalizeTerm(raw);
    if (value === '') continue;
    const start = match.index ?? 0;
    tokens.push({
      value, raw, start, end: start + raw.length,
      camel: /[a-z][A-Z]/.test(raw), number: /^\d+$/.test(raw),
      digit: /\d/.test(raw), nonAscii: /[\u0080-\uFFFF]/.test(raw),
    });
  }
  return tokens;
}

/** A token worth a hash on its own: an id, a name or an accented word. */
function valueToken(token: Token): boolean {
  if (token.camel) return false;
  if (token.digit || token.nonAscii) return true;
  return /^[A-Z][a-z]+$/.test(token.raw) || /^[A-Z]{4,}$/.test(token.raw);
}

/** A phrase word reads as a name; a bare number is a whole value of its own. */
function phraseToken(token: Token): boolean {
  if (token.camel || token.number) return false;
  if (token.digit || token.nonAscii) return true;
  return /^[A-Z][a-z]+$/.test(token.raw);
}

/**
 * Marks the tokens a guard term accounts for. A term is covered only when the
 * n-gram itself is a known term, or the raw span is one number in another
 * spelling; a guarded word next to an unguarded one must not cover it.
 */
function coveredTokens(
  tokens: readonly Token[],
  text: string,
  terms: ReadonlySet<string>,
  allowed: ReadonlySet<string>
): boolean[] {
  const covered = tokens.map(() => false);
  for (let start = 0; start < tokens.length; start++) {
    const max = Math.min(MAX_WORDS, tokens.length - start);
    for (let length = 1; length <= max; length++) {
      const end = start + length;
      const span = text.slice(tokens[start]!.start, tokens[end - 1]!.end);
      const joined = tokens
        .slice(start, end)
        .map((token) => token.value)
        .join(' ');
      const hash = termHash(joined);
      const hit =
        terms.has(hash) ||
        allowed.has(hash) ||
        (isFormattedNumber(span) && findPrivateTerms(span, terms, allowed).length > 0);
      if (!hit) continue;
      for (let index = start; index < end; index++) covered[index] = true;
    }
  }
  return covered;
}

/** True when the full phrase still occurs on one line of `head`. */
export function hasPhrase(head: HeadCorpus, joined: string): boolean {
  const parts = joined.split(' ');
  const first = parts[0]!;
  if (parts.length === 1) return head.tokens.has(first);
  const indexes = head.linesByToken.get(first);
  if (indexes === undefined) return false;
  const needle = ` ${joined} `;
  return indexes.some((index) => ` ${head.lines[index]!} `.includes(needle));
}

function isContentHash(joined: string, line: string): boolean {
  if (CONTENT_HASH.test(joined)) return true;
  if (!SHORT_HASH.test(joined)) return false;
  for (const match of line.matchAll(/[0-9a-f]{32,64}/g)) if (match[0].startsWith(joined)) return true;
  if (!/\d/.test(joined) || !/[a-f]/.test(joined)) return false;
  return GIT_ID_CONTEXT.exec(line)?.[1] === joined;
}

/**
 * Removed terms the guard does not hash. A single token follows the migration
 * token by token; a phrase catches a name whose words survive separately. Both
 * skip code identifiers, dependency metadata and git object ids.
 */
export function uncoveredRemovedTerms(
  deleted: readonly DeletedLine[],
  head: HeadCorpus,
  terms: ReadonlySet<string> = PRIVATE_TERM_HASHES,
  allowed: ReadonlySet<string> = ALLOWED_PHRASE_HASHES,
  excused: ReadonlyMap<string, string> = EXCUSED_REMOVED_TERMS
): RemovedTermHit[] {
  const hits: RemovedTermHit[] = [];
  for (const entry of deleted) {
    if (SKIP_FILE.some((pattern) => pattern.test(entry.file))) continue;
    const tokens = tokenize(entry.text);
    if (tokens.length === 0) continue;
    const covered = coveredTokens(tokens, entry.text, terms, allowed);
    const spans: { start: number; end: number; length: number; hash: string }[] = [];
    const push = (start: number, end: number): void => {
      const joined = tokens
        .slice(start, end)
        .map((token) => token.value)
        .join(' ');
      if (hasPhrase(head, joined)) return;
      const hash = termHash(joined);
      if (excused.has(hash) || isContentHash(joined, entry.text)) return;
      spans.push({ start, end, length: end - start, hash });
    };
    for (let index = 0; index < tokens.length; index++) {
      if (covered[index] || !valueToken(tokens[index]!)) continue;
      push(index, index + 1);
    }
    for (let start = 0; start < tokens.length; start++) {
      const max = Math.min(MAX_WORDS, tokens.length - start);
      for (let length = 2; length <= max; length++) {
        const end = start + length;
        if (covered.slice(start, end).some(Boolean)) continue;
        const slice = tokens.slice(start, end);
        const span = entry.text.slice(tokens[start]!.start, tokens[end - 1]!.end);
        const formatted = slice.every((token) => token.number) && isFormattedNumber(span);
        if (!formatted && !slice.every(phraseToken)) continue;
        push(start, end);
      }
    }
    spans.sort((a, b) => b.length - a.length || a.start - b.start);
    const chosen: typeof spans = [];
    for (const span of spans) {
      if (chosen.some((other) => span.start < other.end && other.start < span.end)) continue;
      chosen.push(span);
    }
    chosen.sort((a, b) => a.start - b.start);
    for (const span of chosen) hits.push({ ...entry, hash: span.hash });
  }
  return hits;
}

function git(args: readonly string[], root: string): string {
  const result = Bun.spawnSync(['git', '-c', 'core.quotepath=false', ...args], { cwd: root });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.toString().trim()}`);
  }
  return result.stdout.toString();
}

/** The old side of every changed line, with its path and line number. */
export function deletedLines(base: string, head: string, root: string): DeletedLine[] {
  const diff = git(
    ['diff', '--unified=0', '--no-color', '--no-ext-diff', '--no-renames', `${base}...${head}`],
    root
  );
  const lines: DeletedLine[] = [];
  let file = '';
  let line = 0;
  let inHunk = false;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      inHunk = false;
    } else if (raw.startsWith('@@ ')) {
      inHunk = true;
      const match = /^@@ -(\d+)(?:,\d+)? /.exec(raw);
      line = match ? Number(match[1]) : 0;
    } else if (inHunk) {
      if (!raw.startsWith('-')) continue;
      lines.push({ file, line, text: raw.slice(1) });
      line++;
    } else if (raw.startsWith('--- ')) {
      file = raw.slice(4).replace(/^a\//, '');
      if (file === '/dev/null') file = '';
    }
  }
  return lines;
}

/** Every normalized line of `head`, indexed by its tokens for phrase lookups. */
export function headCorpus(head: string, root: string): HeadCorpus {
  const result = Bun.spawnSync(
    ['git', '-c', 'core.quotepath=false', 'grep', '--no-color', '-h', '-I', '-e', '.', head, '--', '.'],
    { cwd: root }
  );
  const tokens = new Set<string>();
  const lines: string[] = [];
  const linesByToken = new Map<string, number[]>();
  if (result.exitCode === 1) return { tokens, lines, linesByToken };
  if (result.exitCode !== 0) {
    throw new Error(`git grep failed in ${root}: ${result.stderr.toString().trim()}`);
  }
  for (const raw of result.stdout.toString().split('\n')) {
    const line = normalizeTerm(raw);
    if (line === '') continue;
    const index = lines.length;
    lines.push(line);
    for (const token of line.split(' ')) {
      tokens.add(token);
      const indexes = linesByToken.get(token);
      if (indexes === undefined) linesByToken.set(token, [index]);
      else indexes.push(index);
    }
  }
  return { tokens, lines, linesByToken };
}

export function removedRunsBetween(
  base: string,
  head: string,
  root: string = join(import.meta.dirname, '..'),
  terms: ReadonlySet<string> = PRIVATE_TERM_HASHES,
  allowed: ReadonlySet<string> = ALLOWED_PHRASE_HASHES,
  excused: ReadonlyMap<string, string> = EXCUSED_REMOVED_TERMS
): RemovedTermHit[] {
  return uncoveredRemovedTerms(deletedLines(base, head, root), headCorpus(head, root), terms, allowed, excused);
}

/** A PR that does not maintain the private-data guard has no corpus to check. */
export function guardChanged(base: string, head: string, root: string): boolean {
  const changed = git(['diff', '--name-only', `${base}...${head}`, '--', ...GUARD_FILES], root);
  return changed.trim() !== '';
}

function parseOptions(argv: string[]): { base: string; head: string } {
  const options = { base: 'origin/main', head: 'HEAD' };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--base') options.base = argv[++index] ?? options.base;
    else if (arg === '--head') options.head = argv[++index] ?? options.head;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function main(): void {
  try {
    const root = join(import.meta.dirname, '..');
    const { base, head } = parseOptions(process.argv.slice(2));
    if (!guardChanged(base, head, root)) {
      console.log(`private-terms corpus: skipped (${base}...${head} does not maintain the private-data guard)`);
      return;
    }
    const hits = removedRunsBetween(base, head, root);
    if (hits.length === 0) {
      console.log(`private-terms corpus: every removed term is guarded (${base}...${head})`);
      return;
    }
    for (const hit of hits) {
      console.error(`private-terms corpus: ${hit.file}:${hit.line} has an unguarded removed term (${hit.hash})`);
    }
    console.error('Add its normalized sha256 to PRIVATE_TERM_HASHES, or prove it is not account data.');
    process.exitCode = 1;
  } catch (error) {
    console.error(`private-terms corpus: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) main();
