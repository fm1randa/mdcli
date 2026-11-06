// Single owner for "does this diff change behavior?" (#236) and for parsing a
// unified diff (#260). prova, the fails-on-main gate and risk each ask that
// question with their own path slice; check-eslint-disables and the private
// terms corpus read the numbered lines. The diff parsing, the comment lexer and
// the type-only detection live here so a false positive is fixed once.

export type LineKind = 'add' | 'remove' | 'context';

export interface DiffLine {
  kind: LineKind;
  text: string;
  /** The line number on the side that holds it: old for a removal, new otherwise. */
  line: number;
}

export interface DiffFile {
  path: string;
  hunks: DiffLine[][];
}

export type CommentStyle = 'js' | 'shell';

export interface BehaviorOptions {
  /** A declaration that only changes types is not behavior (risk's slice). */
  ignoreTypeOnly?: boolean;
  /** Shell files use `#` comments; JS files use line and block comments. */
  commentStyle?: CommentStyle;
}

export interface BehaviorScope extends BehaviorOptions {
  includes: (path: string) => boolean;
}

const TYPE_DECLARATION = /^\s*(?:export\s+)?(?:declare\s+)?(?:interface\s+\w|type\s+\w+\s*[=<]|import\s+type\b)/;
const TYPE_OPEN = /^\s*(?:export\s+)?(?:declare\s+)?(?:interface|type)\s+\w+/;

/**
 * The unified diff split into files and hunks, as the question needs it. A
 * header git quotes (a path with a tab or a quote) still opens a file, so its
 * lines are never dropped: the raw header stands in for the path.
 */
export function parseDiff(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  let file: DiffFile | undefined;
  let hunk: DiffLine[] | undefined;
  let oldLine = 0;
  let newLine = 0;
  for (const raw of text.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      const header = /^diff --git a\/(.+) b\/(.+)$/.exec(raw);
      file = { path: header ? header[2] : raw.slice('diff --git '.length), hunks: [] };
      files.push(file);
      hunk = undefined;
      continue;
    }
    if (!file) continue;
    const start = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (start) {
      hunk = [];
      file.hunks.push(hunk);
      oldLine = Number(start[1]);
      newLine = Number(start[2]);
      continue;
    }
    if (!hunk) continue;
    if (raw.startsWith('+')) {
      hunk.push({ kind: 'add', text: raw.slice(1), line: newLine++ });
    } else if (raw.startsWith('-')) {
      hunk.push({ kind: 'remove', text: raw.slice(1), line: oldLine++ });
    } else if (raw.startsWith(' ')) {
      hunk.push({ kind: 'context', text: raw.slice(1), line: newLine++ });
      oldLine++;
    }
  }
  return files;
}

/**
 * Per line, whether code remains after its comments are skipped. A block that
 * never closes inside the hunk is treated as code: the diff alone cannot prove
 * the rest is a comment, so the question fails to the safe side.
 */
function codeLines(lines: string[], style: CommentStyle): boolean[] {
  const code = lines.map(() => false);
  let inBlock = false;
  let openLine = -1;
  for (const [lineIndex, text] of lines.entries()) {
    let index = 0;
    while (index < text.length) {
      if (inBlock) {
        const close = text.indexOf('*/', index);
        if (close === -1) break;
        inBlock = false;
        index = close + 2;
        continue;
      }
      const char = text[index];
      if (char === ' ' || char === '\t' || char === '\r') {
        index++;
        continue;
      }
      if (style === 'shell') {
        if (char !== '#') code[lineIndex] = true;
        break;
      }
      if (char === '/' && text[index + 1] === '/') break;
      if (char === '/' && text[index + 1] === '*') {
        inBlock = true;
        openLine = lineIndex;
        index += 2;
        continue;
      }
      code[lineIndex] = true;
      break;
    }
  }
  if (inBlock) {
    for (let index = openLine; index < lines.length; index++) {
      if (lines[index].trim() !== '') code[index] = true;
    }
  }
  return code;
}

function stripTypeSyntax(line: string): string {
  return line
    .replace(/\bimport\s+type\b[^\n]*$/, '')
    .replace(
      /(?<![A-Za-z0-9_$\]>])\(([^()]*(?:\([^()]*\)[^()]*)*)\s+as\s+(?:unknown|any|[A-Z_$][\w$.]*)(?:\s*<[^>]*>)?\)/g,
      '$1',
    )
    .replace(/\s+as\s+(?:unknown|any|[A-Z_$][\w$.]*)(?:\s*<[^>]*>)?/g, '')
    .replace(/\)\s*:\s*[A-Z_$][\w$.]*(?:\s*<[^>]*>)?(?=\s*\{)/g, ')')
    .replace(/\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*:\s*[A-Za-z_$][\w$.]*(?:\s*<[^>]*>)?(?=\s*=)/g, '$1 $2')
    .replace(/\(([A-Za-z_$][\w$]*)\??\s*:\s*[A-Z_$][\w$.]*(?:\s*<[^>]*>)?(?=\))/g, '($1');
}

function typeOnlyForm(line: string): string {
  return stripTypeSyntax(line)
    .replace(/[\s;]/g, '')
    .replace(/,+$/, '');
}

function braceDelta(text: string): number {
  return text.split('{').length - text.split('}').length;
}

/** A removal and an addition whose only difference is a type annotation. */
function markTypePairs(hunk: DiffLine[]): Set<number> {
  const ignored = new Set<number>();
  const removals = hunk.map((line, index) => ({ line, index })).filter((entry) => entry.line.kind === 'remove');
  const additions = hunk.map((line, index) => ({ line, index })).filter((entry) => entry.line.kind === 'add');
  const usedAdditions = new Set<number>();
  for (const removal of removals) {
    const form = typeOnlyForm(removal.line.text);
    const match = additions.find(
      (addition) => !usedAdditions.has(addition.index) && typeOnlyForm(addition.line.text) === form,
    );
    if (!match) continue;
    usedAdditions.add(match.index);
    ignored.add(removal.index);
    ignored.add(match.index);
  }
  return ignored;
}

/**
 * The changed lines in a hunk that carry behavior: an added or removed line
 * with code, and, under `ignoreTypeOnly`, not a type declaration or a line
 * inside an open type block. Context lines never carry the change; they only
 * keep the comment and type state honest.
 */
export function behaviorIndexes(hunk: DiffLine[], options: BehaviorOptions = {}): Set<number> {
  const style = options.commentStyle ?? 'js';
  const ignored = options.ignoreTypeOnly ? markTypePairs(hunk) : undefined;
  const code = codeLines(hunk.map((line) => line.text), style);
  const behavior = new Set<number>();
  let typeDepth = 0;
  for (const [index, line] of hunk.entries()) {
    if (line.kind !== 'context' && !ignored?.has(index)) {
      const typeOnly = options.ignoreTypeOnly === true && (TYPE_DECLARATION.test(line.text) || typeDepth > 0);
      if (code[index] && !typeOnly) behavior.add(index);
    }
    if (TYPE_OPEN.test(line.text)) typeDepth += braceDelta(line.text);
    else if (typeDepth > 0) typeDepth = Math.max(0, typeDepth + braceDelta(line.text));
  }
  return behavior;
}

/** True when any hunk of the file changes behavior. */
export function fileChangesBehavior(file: DiffFile, options: BehaviorOptions = {}): boolean {
  return file.hunks.some((hunk) => behaviorIndexes(hunk, options).size > 0);
}

/** True when any file matched by `includes` changes behavior. */
export function changesBehavior(files: DiffFile[], scope: BehaviorScope): boolean {
  return files.some((file) => scope.includes(file.path) && fileChangesBehavior(file, scope));
}
