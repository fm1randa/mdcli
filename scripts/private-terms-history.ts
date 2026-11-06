import { parseInteger } from '../src/utils/parse.js';
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

export function git(args: readonly string[], root: string): string {
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
      line = match ? parseInteger(match[1]) ?? 0 : 0;
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
