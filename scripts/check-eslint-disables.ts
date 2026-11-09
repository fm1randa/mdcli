import { readFileSync } from 'node:fs';
import tseslint from 'typescript-eslint';
import { parseDiff } from './behavior-change.js';
import { git, gitResult, parseBase } from './git.js';

// A copied eslint-disable is how the bare-exit pattern spread (#155, #187).
// Compare the branch with main and fail on any added directive without a
// reason after "--" (the same reason local/disable-directive-description
// requires), independent of removals: removing one never excuses a new bare
// suppression. Only real comments count: a directive inside a test string is
// not one.
const DIRECTIVE = /^\s*eslint-disable(?:-next-line|-line)?\b/;
const REASON = /\s--\s+\S/;
const LINTED = /\.(?:[cm]?[jt]sx?)$/;

interface AddedDisable {
  path: string;
  line: number;
  text: string;
  hasReason: boolean;
}

export interface DiffCount {
  added: AddedDisable[];
  removed: number;
  /** Added directives without a reason: the step fails on any of them. */
  undocumented: AddedDisable[];
}

interface DiffLine {
  path: string;
  line: number;
  text: string;
}

type Side = 'old' | 'new';
export type ContentReader = (path: string, side: Side) => string | undefined;

function changedLines(diff: string): { added: DiffLine[]; removed: DiffLine[] } {
  const added: DiffLine[] = [];
  const removed: DiffLine[] = [];
  for (const file of parseDiff(diff)) {
    if (!LINTED.test(file.path)) continue;
    for (const { kind, line, text } of file.hunks.flat()) {
      if (kind === 'add') added.push({ path: file.path, line, text });
      else if (kind === 'remove') removed.push({ path: file.path, line, text });
    }
  }
  return { added, removed };
}

interface ParsedComment {
  value: string;
  loc?: { start: { line: number } };
}

interface Directive {
  hasReason: boolean;
}

/** Directives by starting line, read from the parsed comments. */
function directives(content: string): Map<number, Directive> {
  const { ast } = tseslint.parser.parseForESLint(content);
  const comments = (ast as typeof ast & { comments?: ParsedComment[] }).comments ?? [];
  const found = new Map<number, Directive>();
  for (const comment of comments) {
    if (comment.loc && DIRECTIVE.test(comment.value)) {
      found.set(comment.loc.start.line, { hasReason: REASON.test(comment.value) });
    }
  }
  return found;
}

/** Line numbers where an eslint-disable directive starts, read from the parsed comments. */
export function directiveLines(content: string): Set<number> {
  return new Set(directives(content).keys());
}

/** Counts the directives a diff adds and removes, reading the file at each side. */
export function countDisables(diff: string, read: ContentReader): DiffCount {
  const { added, removed } = changedLines(diff);
  const cache = new Map<string, Map<number, Directive>>();
  const directiveAt = (path: string, line: number, side: Side): Directive | undefined => {
    const key = `${side}:${path}`;
    let byLine = cache.get(key);
    if (byLine === undefined) {
      const content = read(path, side);
      byLine = content === undefined ? new Map() : directives(content);
      cache.set(key, byLine);
    }
    return byLine.get(line);
  };
  const addedDisables = added.flatMap((line) => {
    const directive = directiveAt(line.path, line.line, 'new');
    return directive ? [{ ...line, hasReason: directive.hasReason }] : [];
  });
  return {
    added: addedDisables,
    removed: removed.filter((line) => directiveAt(line.path, line.line, 'old') !== undefined).length,
    undocumented: addedDisables.filter((directive) => !directive.hasReason),
  };
}

function gitShow(ref: string, path: string): string | undefined {
  const result = gitResult(['show', `${ref}:${path}`]);
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
  base: string;
  head?: string;
}

function parseOptions(argv: string[]): Options {
  const { base, rest } = parseBase(argv);
  const options: Options = { base };
  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index];
    if (arg === '--head') {
      options.head = rest[++index];
      if (options.head === undefined) throw new Error('--head needs a revision');
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

function gitDiff(base: string, head: string | undefined): string {
  const args = ['diff', '--unified=0', '--no-renames', '--no-color', base];
  if (head !== undefined) args.push(head);
  return git(args);
}

function main(): void {
  try {
    const options = parseOptions(process.argv.slice(2));
    const { base } = options;
    const range = `${base}${options.head ? `..${options.head}` : ''}`;
    const { added, removed, undocumented } = countDisables(gitDiff(base, options.head), reader(base, options.head));
    if (undocumented.length > 0) {
      console.error(
        `✗ eslint-disable: o diff contra ${range} adiciona ${undocumented.length} directive(s) sem motivo depois de "--" ` +
          `(remove ${removed}). A supressão copiada não é a correção (#187); use a saída sancionada ` +
          '(exitAfterFlush, card-invoice), explique o motivo ou remova o disable.',
      );
      for (const directive of undocumented) console.error(`  ${directive.path}:${directive.line}: ${directive.text.trim()}`);
      process.exitCode = 1;
      return;
    }
    const addedText = added.length === 0 ? '0 added' : `${added.length} added, all with a reason`;
    console.log(`✓ eslint-disable: ${addedText}, ${removed} removed (${range})`);
  } catch (error) {
    console.error(`eslint-disable: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) main();
