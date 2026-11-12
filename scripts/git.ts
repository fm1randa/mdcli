// Single owner of child processes in scripts/ (#260). Each gate used to spawn
// git, gh and bun through its own Bun.spawnSync wrapper, with its own error
// text, its own quoting and its own `origin/main` default, so a fix (path
// quoting, the oven-sh/bun#34069 hang) landed in one copy and missed the rest.
// local/no-raw-spawn keeps every other file in scripts/ on this module.

/** The revision every gate compares the branch against unless `--base` says otherwise. */
export const DEFAULT_BASE = 'origin/main';

/** A checkout without the origin remote still names the trunk `main`. */
const FALLBACK_BASE = 'main';

/**
 * Takes `<flag> <rev>` out of a gate's argv and leaves the rest to the gate.
 * A flag without a value fails, and so does a value that looks like another
 * flag: reading `--head -x` as a revision runs the gate against nothing anyone
 * asked for (#268, #286).
 */
export function parseRevisionFlag(
  argv: readonly string[],
  flag: '--base' | '--head'
): { value: string | undefined; rest: string[] } {
  let value: string | undefined;
  const rest: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg !== flag) {
      rest.push(arg);
      continue;
    }
    const next = argv[++index];
    if (next === undefined || next.startsWith('-')) throw new Error(`${flag} needs a revision`);
    value = next;
  }
  return { value, rest };
}

/** `--base <rev>`, defaulting to DEFAULT_BASE; a `--base` without a value fails instead of falling back. */
export function parseBase(argv: readonly string[]): { base: string; rest: string[] } {
  const { value, rest } = parseRevisionFlag(argv, '--base');
  return { base: value ?? DEFAULT_BASE, rest };
}

/**
 * The base a gate runs against when nobody passed `--base`: DEFAULT_BASE, or
 * `main` in a clone without the remote, or undefined when neither exists (a
 * shallow checkout), so the caller can skip a comparison it cannot make.
 * scripts/verify.sh reads it through `bun scripts/git.ts --print-base`.
 */
export function resolveBase(cwd?: string): string | undefined {
  return [DEFAULT_BASE, FALLBACK_BASE].find((ref) => revisionExists(ref, cwd));
}

export interface SpawnResult {
  exitCode: number;
  stdout: Buffer;
  stderr: Buffer;
}

export interface SpawnOptions {
  cwd?: string;
  stdin?: Uint8Array;
}

/** Runs a child to completion with piped output; the caller reads the exit code. */
export function spawn(command: readonly string[], options: SpawnOptions = {}): SpawnResult {
  const result = Bun.spawnSync([...command], {
    cwd: options.cwd,
    stdin: options.stdin,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
}

export interface TextResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * The async path for code that runs inside `bun test --parallel`: Bun 1.4.2
 * can hang a spawnSync call there (oven-sh/bun#34069), and Bun.spawn clears
 * the same reports.
 */
export async function spawnAsync(
  command: readonly string[],
  options: { cwd?: string; timeout?: number } = {}
): Promise<TextResult> {
  const proc = Bun.spawn([...command], {
    cwd: options.cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

// Non-ASCII paths stay readable in every diff, ls-files and grep the gates parse.
const GIT = ['git', '-c', 'core.quotepath=false'] as const;

/** git with the exit code left to the caller (a grep without matches exits 1). */
export function gitResult(args: readonly string[], cwd?: string, stdin?: Uint8Array): SpawnResult {
  return spawn([...GIT, ...args], { cwd, stdin });
}

function failure(args: readonly string[], cwd: string | undefined, stderr: string): Error {
  const where = cwd === undefined ? '' : ` in ${cwd}`;
  return new Error(`git ${args.join(' ')} failed${where}: ${stderr.trim()}`);
}

/** git's raw stdout; throws with git's stderr when it exits non-zero. */
export function gitBytes(args: readonly string[], cwd?: string, stdin?: Uint8Array): Buffer {
  const result = gitResult(args, cwd, stdin);
  if (result.exitCode !== 0) throw failure(args, cwd, result.stderr.toString());
  return result.stdout;
}

/** git's stdout as text; throws with git's stderr when it exits non-zero. */
export function git(args: readonly string[], cwd?: string): string {
  return gitBytes(args, cwd).toString();
}

/** git's stdout as text off the spawnSync path (see spawnAsync); throws with git's stderr on a non-zero exit. */
export async function gitAsync(args: readonly string[], cwd?: string): Promise<string> {
  const result = await spawnAsync([...GIT, ...args], { cwd });
  if (result.exitCode !== 0) throw failure(args, cwd, result.stderr);
  return result.stdout;
}

/** The `head` that diffs against the files on disk, uncommitted edits included. */
export const WORKING_TREE = Symbol('working tree');

export interface DiffOptions {
  head?: string | typeof WORKING_TREE;
  /** Extra `git diff` flags, such as `--name-status` or `--unified=0`. */
  flags?: readonly string[];
  paths?: readonly string[];
  cwd?: string;
}

/**
 * What the branch changed since it left `base`: `git diff base...head` (head
 * defaults to HEAD; WORKING_TREE compares the merge base with the files on
 * disk), without rename detection so a moved file shows as a delete plus an
 * add that every gate's parser reads the same way.
 */
export function diffAgainst(base: string, options: DiffOptions = {}): string {
  const { head = 'HEAD', flags = [], paths = [], cwd } = options;
  const range = head === WORKING_TREE ? ['--merge-base', base] : [`${base}...${head}`];
  return git(['diff', '--no-renames', '--no-color', ...flags, ...range, '--', ...paths], cwd);
}

/** The commits head carries that base lacks (`base..head`): what a squash merge of the branch brings in. */
export function logRange(base: string, head: string = 'HEAD'): string {
  return `${base}..${head}`;
}

/** The commit `diffAgainst(base, { head })` compares against: where head left base. */
export function mergeBase(base: string, head: string = 'HEAD', cwd?: string): string {
  return git(['merge-base', base, head], cwd).trim();
}

/** git's trimmed stdout, or undefined when it exits non-zero. */
export function gitQuiet(args: readonly string[], cwd?: string): string | undefined {
  const result = gitResult(args, cwd);
  return result.exitCode === 0 ? result.stdout.toString().trim() : undefined;
}

/** True when `ref` names a commit; an unborn HEAD names none. */
export function revisionExists(ref: string, cwd?: string): boolean {
  return gitQuiet(['rev-parse', '--verify', '--quiet', ref], cwd) !== undefined;
}

/** The repository root of `cwd`, so a subdirectory still sees the whole tree. */
export function repoRoot(cwd: string = process.cwd()): string {
  return git(['rev-parse', '--show-toplevel'], cwd).trim();
}

if (import.meta.main) {
  const [command] = process.argv.slice(2);
  if (command === '--print-base') {
    console.log(resolveBase() ?? '');
  } else {
    console.error('usage: bun scripts/git.ts --print-base');
    process.exitCode = 2;
  }
}
