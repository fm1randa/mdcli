import { readFileSync } from 'node:fs';
import tseslint from 'typescript-eslint';

// A copied eslint-disable is how the bare-exit pattern spread (#155, #187).
// Compare the branch with main and fail when the diff adds more directives
// than it removes, so a new suppression is a deliberate, reviewed choice.
// Only real comments count: a directive inside a test string is not one.
const DIRECTIVE = /^\s*eslint-disable(?:-next-line|-line)?\b/;
const LINTED = /\.(?:[cm]?[jt]sx?)$/;

export interface AddedDisable {
  path: string;
  line: number;
  text: string;
}

export interface DiffCount {
  added: AddedDisable[];
  removed: number;
}

interface DiffLine {
  path: string;
  line: number;
  text: string;
}

export type Side = 'old' | 'new';
export type ContentReader = (path: string, side: Side) => string | undefined;

function parseDiff(diff: string): { added: DiffLine[]; removed: DiffLine[] } {
  const added: DiffLine[] = [];
  const removed: DiffLine[] = [];
  let path = '';
  let oldLine = 0;
  let newLine = 0;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      // `diff --git a/<path> b/<path>`: the b/ side names the file after the change.
      path = raw.split(' b/', 2)[1] ?? '';
      continue;
    }
    if (raw.startsWith('+++ b/')) {
      path = raw.slice('+++ b/'.length);
      continue;
    }
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      continue;
    }
    if (path === '' || !LINTED.test(path)) continue;
    if (raw.startsWith('+')) {
      added.push({ path, line: newLine, text: raw.slice(1) });
      newLine += 1;
    } else if (raw.startsWith('-')) {
      removed.push({ path, line: oldLine, text: raw.slice(1) });
      oldLine += 1;
    } else if (raw.startsWith(' ')) {
      oldLine += 1;
      newLine += 1;
    }
  }
  return { added, removed };
}

interface ParsedComment {
  value: string;
  loc?: { start: { line: number } };
}

/** Line numbers where an eslint-disable directive starts, read from the parsed comments. */
export function directiveLines(content: string): Set<number> {
  const { ast } = tseslint.parser.parseForESLint(content);
  const comments = (ast as typeof ast & { comments?: ParsedComment[] }).comments ?? [];
  const lines = new Set<number>();
  for (const comment of comments) {
    if (comment.loc && DIRECTIVE.test(comment.value)) lines.add(comment.loc.start.line);
  }
  return lines;
}

/** Counts the directives a diff adds and removes, reading the file at each side. */
export function countDisables(diff: string, read: ContentReader): DiffCount {
  const { added, removed } = parseDiff(diff);
  const cache = new Map<string, Set<number>>();
  const isDirective = (path: string, line: number, side: Side): boolean => {
    const key = `${side}:${path}`;
    let lines = cache.get(key);
    if (lines === undefined) {
      const content = read(path, side);
      lines = content === undefined ? new Set() : directiveLines(content);
      cache.set(key, lines);
    }
    return lines.has(line);
  };
  return {
    added: added.filter((line) => isDirective(line.path, line.line, 'new')),
    removed: removed.filter((line) => isDirective(line.path, line.line, 'old')).length,
  };
}

function gitShow(ref: string, path: string): string | undefined {
  const result = Bun.spawnSync(['git', 'show', `${ref}:${path}`], { stdout: 'pipe', stderr: 'pipe' });
  return result.exitCode === 0 ? result.stdout.toString() : undefined;
}

function workingTree(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

function reader(base: string, head: string | undefined): ContentReader {
  return (path, side) => {
    if (side === 'old') return gitShow(base, path);
    return head === undefined ? workingTree(path) : (gitShow(head, path) ?? workingTree(path));
  };
}

interface Options {
  base?: string;
  head?: string;
}

function parseOptions(argv: string[]): Options {
  const options: Options = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--base') {
      options.base = argv[++index];
    } else if (arg === '--head') {
      options.head = argv[++index];
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

function gitDiff(base: string, head: string | undefined): string {
  const args = ['git', 'diff', '--unified=0', '--no-renames', '--no-color', base];
  if (head !== undefined) args.push(head);
  const result = Bun.spawnSync(args, { stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) {
    throw new Error(`git diff against ${base}${head ? `..${head}` : ''} failed: ${result.stderr.toString().trim()}`);
  }
  return result.stdout.toString();
}

function main(): void {
  try {
    const options = parseOptions(process.argv.slice(2));
    const base = options.base ?? 'origin/main';
    const range = `${base}${options.head ? `..${options.head}` : ''}`;
    const { added, removed } = countDisables(gitDiff(base, options.head), reader(base, options.head));
    if (added.length > removed) {
      console.error(
        `✗ eslint-disable: o diff contra ${range} adiciona ${added.length} e remove ${removed}. ` +
          'A supressão copiada não é a correção (#187); use a saída sancionada (exitAfterFlush, card-invoice) ou remova o disable.',
      );
      for (const directive of added) console.error(`  ${directive.path}:${directive.line}: ${directive.text.trim()}`);
      process.exitCode = 1;
      return;
    }
    console.log(`✓ eslint-disable: ${added.length} added, ${removed} removed (${range})`);
  } catch (error) {
    console.error(`eslint-disable: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) main();
