import { join } from 'node:path';
import { EXCUSED_REMOVED_TERMS } from './private-terms-excused.js';
import {
  ALLOWED_PHRASE_HASHES,
  KEYED_TERM_HASHES,
  MAX_WORDS,
  PRIVATE_TERM_HASHES,
  findPrivateTerms,
  isFormattedNumber,
  isNumericTerm,
  keyedTermHash,
  normalizeTerm,
  privateTermsKey,
  requirePrivateTermsKey,
  termHash,
} from './private-terms.js';

import { diffAgainst, parseBase, parseRevisionFlag } from './git.js';
import { deletedLines, headCorpus, type DeletedLine, type HeadCorpus } from './private-terms-history.js';

export { deletedLines } from './private-terms-history.js';

export interface RemovedTermHit extends DeletedLine {
  hash: string;
  /** Word count when the value exceeds the guard's representation limit. */
  overlong?: number;
  /** The value is numeric, so only a keyed hash or an excuse may cover it. */
  numeric?: boolean;
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
  'scripts/private-terms-hashes.ts',
  'scripts/private-terms-history.ts',
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
  allowed: ReadonlySet<string>,
  keyed: ReadonlySet<string>,
  key: string | undefined
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
      // An unsalted hash of a numeric value is a public fingerprint (#221), so
      // only a keyed hash may cover it; a name keeps the unsalted hash.
      const numeric = isNumericTerm(joined);
      const hit =
        allowed.has(hash) ||
        (numeric ? key !== undefined && keyed.has(keyedTermHash(joined, key)) : terms.has(hash)) ||
        (isFormattedNumber(span) && findPrivateTerms(span, new Set(), allowed, keyed, key).length > 0);
      if (!hit) continue;
      for (let index = start; index < end; index++) covered[index] = true;
    }
  }
  return covered;
}

/** True when the full phrase still occurs on one line of `head`. */
function hasPhrase(head: HeadCorpus, joined: string): boolean {
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
 * token by token; a phrase catches a name whose words survive separately. A
 * name-like run longer than `MAX_WORDS` fails as one value when none of its
 * words is guarded, and the words a shorter sub-phrase leaves uncovered still
 * report on their own, because the scanner can never match the whole run as a
 * single term. All of them skip code identifiers, dependency metadata and git
 * object ids.
 */
function uncoveredRemovedTerms(
  deleted: readonly DeletedLine[],
  head: HeadCorpus,
  terms: ReadonlySet<string> = PRIVATE_TERM_HASHES,
  allowed: ReadonlySet<string> = ALLOWED_PHRASE_HASHES,
  excused: ReadonlyMap<string, string> = EXCUSED_REMOVED_TERMS,
  keyed: ReadonlySet<string> = KEYED_TERM_HASHES,
  key: string | undefined = privateTermsKey()
): RemovedTermHit[] {
  const hits: RemovedTermHit[] = [];
  for (const entry of deleted) {
    if (SKIP_FILE.some((pattern) => pattern.test(entry.file))) continue;
    const tokens = tokenize(entry.text);
    if (tokens.length === 0) continue;
    const covered = coveredTokens(tokens, entry.text, terms, allowed, keyed, key);
    for (let start = 0; start < tokens.length; ) {
      if (!phraseToken(tokens[start]!)) { start++; continue; }
      let end = start; while (end < tokens.length && phraseToken(tokens[end]!)) end++;
      const run = tokens.slice(start, end);
      const joined = run.map((token) => token.value).join(' ');
      if (run.length > MAX_WORDS && !hasPhrase(head, joined)) {
        const anyCovered = run.some((_, offset) => covered[start + offset]);
        if (!anyCovered) {
          const window = run.slice(0, MAX_WORDS).map((token) => token.value).join(' ');
          const hash = termHash(window);
          if (!excused.has(hash) && !excused.has(termHash(joined))) {
            hits.push({ ...entry, hash, overlong: run.length });
          }
          for (let index = start; index < end; index++) covered[index] = true;
        }
      }
      start = end;
    }
    const spans: { start: number; end: number; length: number; hash: string; numeric: boolean }[] = [];
    const push = (start: number, end: number): void => {
      const joined = tokens
        .slice(start, end)
        .map((token) => token.value)
        .join(' ');
      if (hasPhrase(head, joined)) return;
      const hash = termHash(joined);
      if (excused.has(hash) || isContentHash(joined, entry.text)) return;
      const numeric = isNumericTerm(joined);
      // Without the key the guard cannot check a numeric value; the caller
      // says so instead of failing every run or pretending it checked.
      if (numeric && key === undefined) return;
      spans.push({ start, end, length: end - start, hash, numeric });
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
    for (const span of chosen) hits.push({ ...entry, hash: span.hash, ...(span.numeric ? { numeric: true } : {}) });
  }
  return hits;
}

export function removedRunsBetween(
  base: string,
  head: string,
  root: string = join(import.meta.dirname, '..'),
  terms: ReadonlySet<string> = PRIVATE_TERM_HASHES,
  allowed: ReadonlySet<string> = ALLOWED_PHRASE_HASHES,
  excused: ReadonlyMap<string, string> = EXCUSED_REMOVED_TERMS,
  keyed: ReadonlySet<string> = KEYED_TERM_HASHES,
  key: string | undefined = privateTermsKey()
): RemovedTermHit[] {
  return uncoveredRemovedTerms(
    deletedLines(base, head, root),
    headCorpus(head, root),
    terms,
    allowed,
    excused,
    keyed,
    key
  );
}

/** A PR that does not maintain the private-data guard has no corpus to check. */
export function guardChanged(base: string, head: string, root: string): boolean {
  const changed = diffAgainst(base, { head, flags: ['--name-only'], paths: GUARD_FILES, cwd: root });
  return changed.trim() !== '';
}

function parseOptions(argv: string[]): { base: string; head: string } {
  const { base, rest } = parseBase(argv);
  const { value: head = 'HEAD', rest: unknown } = parseRevisionFlag(rest, '--head');
  if (unknown.length > 0) throw new Error(`unknown argument: ${unknown[0]}`);
  return { base, head };
}

function main(): void {
  try {
    const root = join(import.meta.dirname, '..');
    const { base, head } = parseOptions(process.argv.slice(2));
    const key = requirePrivateTermsKey();
    if (!guardChanged(base, head, root)) {
      console.log(`private-terms corpus: skipped (${base}...${head} does not maintain the private-data guard)`);
      return;
    }
    if (key === undefined && KEYED_TERM_HASHES.size > 0) {
      console.error(
        'private-terms corpus: warning: MDCLI_PRIVATE_TERMS_KEY is unset; low-entropy numeric terms were not checked'
      );
    }
    const hits = removedRunsBetween(base, head, root);
    if (hits.length === 0) {
      console.log(`private-terms corpus: every removed term is guarded (${base}...${head})`);
      return;
    }
    for (const hit of hits) {
      const subject = hit.overlong
        ? `removes a ${hit.overlong}-word term, above the guard's ${MAX_WORDS}-word limit, and no registered sub-phrase detects it`
        : hit.numeric
          ? 'has an unguarded removed numeric term; register its keyed hash (MDCLI_PRIVATE_TERMS_KEY)'
          : 'has an unguarded removed term';
      console.error(`private-terms corpus: ${hit.file}:${hit.line} ${subject} (${hit.hash})`);
    }
    console.error(
      `The guard matches n-grams up to ${MAX_WORDS} words; every word of a removed run must fall inside a registered n-gram. Add the shown sha256 to PRIVATE_TERM_HASHES, or prove the value is not account data. A numeric value needs a keyed hash in KEYED_TERM_HASHES, never an unsalted one (#221).`
    );
    process.exitCode = 1;
  } catch (error) {
    console.error(`private-terms corpus: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) main();
