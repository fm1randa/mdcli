import { join } from 'node:path';
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

/** A git object id identifies content, not a person. */
const CONTENT_HASH = /^[0-9a-f]{32,64}$/;

/** A word is letters or digits; `1e3` and `0x10` stay one token, like normalizeTerm. */
const WORD = /[\p{L}\p{N}]+/gu;

/**
 * Removed terms proven not to be account data. The hash keeps the term out of
 * the repository; the comment is the reason the review can check.
 */
const EXCUSED_REMOVED_TERMS: ReadonlySet<string> = new Set([
  // "shaped", the English word from a reworded comment about a card.
  '0266a143d4d04392435431eea1f5d960e1e9a13af49bc7e54d79463b88f8a144',
]);

interface Token {
  value: string;
  start: number;
  end: number;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(WORD)) {
    const value = normalizeTerm(match[0]);
    const start = match.index ?? 0;
    if (value !== '') tokens.push({ value, start, end: start + match[0].length });
  }
  return tokens;
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
        terms.has(hash) || allowed.has(hash) || (isFormattedNumber(span) && findPrivateTerms(span, terms, allowed).length > 0);
      if (!hit) continue;
      for (let index = start; index < end; index++) covered[index] = true;
    }
  }
  return covered;
}

/**
 * Terms the base corpus lost without a guard hash. Every token that no longer
 * occurs anywhere in `head` is a candidate, so the check follows the migration
 * instead of the terms a review happened to notice.
 */
export function uncoveredRemovedRuns(
  deleted: readonly DeletedLine[],
  headTokens: ReadonlySet<string>,
  terms: ReadonlySet<string> = PRIVATE_TERM_HASHES,
  allowed: ReadonlySet<string> = ALLOWED_PHRASE_HASHES
): RemovedTermHit[] {
  const hits: RemovedTermHit[] = [];
  for (const entry of deleted) {
    const tokens = tokenize(entry.text);
    if (!tokens.some((token) => !headTokens.has(token.value))) continue;
    const covered = coveredTokens(tokens, entry.text, terms, allowed);
    let run = '';
    const flush = (): void => {
      if (run === '') return;
      const hash = termHash(run);
      if (!EXCUSED_REMOVED_TERMS.has(hash) && !CONTENT_HASH.test(run)) hits.push({ ...entry, hash });
      run = '';
    };
    tokens.forEach((token, index) => {
      if (headTokens.has(token.value) || covered[index]) flush();
      else run = run === '' ? token.value : `${run} ${token.value}`;
    });
    flush();
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
      if (raw.startsWith('-')) lines.push({ file, line, text: raw.slice(1) });
      if (raw.startsWith('-')) line++;
    } else if (raw.startsWith('--- ')) {
      file = raw.slice(4).replace(/^a\//, '');
      if (file === '/dev/null') file = '';
    }
  }
  return lines;
}

/** Every token present anywhere in `head`, so a word that survived is not removed. */
export function headTokens(head: string, root: string): Set<string> {
  const result = Bun.spawnSync(
    ['git', '-c', 'core.quotepath=false', 'grep', '--no-color', '-h', '-I', '-e', '.', head, '--', '.'],
    { cwd: root }
  );
  if (result.exitCode === 1) return new Set();
  if (result.exitCode !== 0) {
    throw new Error(`git grep failed in ${root}: ${result.stderr.toString().trim()}`);
  }
  const tokens = new Set<string>();
  for (const token of normalizeTerm(result.stdout.toString()).split(' ')) {
    if (token !== '') tokens.add(token);
  }
  return tokens;
}

export function removedRunsBetween(
  base: string,
  head: string,
  root: string = join(import.meta.dirname, '..'),
  terms: ReadonlySet<string> = PRIVATE_TERM_HASHES,
  allowed: ReadonlySet<string> = ALLOWED_PHRASE_HASHES
): RemovedTermHit[] {
  return uncoveredRemovedRuns(deletedLines(base, head, root), headTokens(head, root), terms, allowed);
}

interface Options {
  base: string;
  head: string;
}

function parseOptions(argv: string[]): Options {
  const options: Options = { base: 'origin/main', head: 'HEAD' };
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
    const { base, head } = parseOptions(process.argv.slice(2));
    const hits = removedRunsBetween(base, head);
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
