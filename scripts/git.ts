// Single owner of child processes in scripts/ (#260). Each gate used to spawn
// git, gh and bun through its own Bun.spawnSync wrapper, with its own error
// text, its own quoting and its own `origin/main` default, so a fix (path
// quoting, the oven-sh/bun#34069 hang) landed in one copy and missed the rest.
// local/no-raw-spawn keeps every other file in scripts/ on this module.

/** The revision every gate compares the branch against unless `--base` says otherwise. */
export const DEFAULT_BASE = 'origin/main';

/**
 * Takes `--base <rev>` out of a gate's argv and leaves the rest to the gate.
 * A `--base` without a value fails: falling back to the default would run the
 * gate against a revision nobody asked for (#268).
 */
export function parseBase(argv: readonly string[]): { base: string; rest: string[] } {
  let base = DEFAULT_BASE;
  const rest: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg !== '--base') {
      rest.push(arg);
      continue;
    }
    const value = argv[++index];
    if (value === undefined || value.startsWith('-')) throw new Error('--base needs a revision');
    base = value;
  }
  return { base, rest };
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

export interface DiffOptions {
  head?: string;
  /** Extra `git diff` flags, such as `--name-status` or `--unified=0`. */
  flags?: readonly string[];
  paths?: readonly string[];
  cwd?: string;
}

/**
 * What the branch changed since it left `base`: `git diff base...head` (head
 * defaults to HEAD), without rename detection so a moved file shows as a delete
 * plus an add that every gate's parser reads the same way.
 */
export function diffAgainst(base: string, options: DiffOptions = {}): string {
  const { head = 'HEAD', flags = [], paths = [], cwd } = options;
  return git(['diff', '--no-renames', '--no-color', ...flags, `${base}...${head}`, '--', ...paths], cwd);
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
