import { parseDiff } from './behavior-change.js';
import { git, gitResult } from './git.js';
import { normalizeTerm } from './private-terms.js';

export interface DeletedLine {
  file: string;
  line: number;
  text: string;
}

export interface HeadCorpus {
  readonly tokens: ReadonlySet<string>;
  readonly lines: readonly string[];
  readonly linesByToken: ReadonlyMap<string, readonly number[]>;
}

/** The old side of every changed line, with its path and line number. */
export function deletedLines(base: string, head: string, root: string): DeletedLine[] {
  const diff = git(
    ['diff', '--unified=0', '--no-color', '--no-ext-diff', '--no-renames', `${base}...${head}`],
    root
  );
  return parseDiff(diff).flatMap((file) =>
    file.hunks.flat().flatMap(({ kind, line, text }) => (kind === 'remove' ? [{ file: file.path, line, text }] : []))
  );
}

/** Every normalized line of `head`, indexed by its tokens for phrase lookups. */
export function headCorpus(head: string, root: string): HeadCorpus {
  const result = gitResult(['grep', '--no-color', '-h', '-I', '-e', '.', head, '--', '.'], root);
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
