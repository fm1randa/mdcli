// Single owner of child processes in scripts/ (#260). Each gate used to spawn
// git, gh and bun through its own Bun.spawnSync wrapper, with its own error
// text, its own quoting and its own `origin/main` default, so a fix (path
// quoting, the oven-sh/bun#34069 hang) landed in one copy and missed the rest.
// local/no-raw-spawn keeps every other file in scripts/ on this module.

/** The revision every gate compares the branch against unless `--base` says otherwise. */
export const DEFAULT_BASE = 'origin/main';

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

function failure(args: readonly string[], cwd: string | undefined, result: SpawnResult): Error {
  const where = cwd === undefined ? '' : ` in ${cwd}`;
  return new Error(`git ${args.join(' ')} failed${where}: ${result.stderr.toString().trim()}`);
}

/** git's raw stdout; throws with git's stderr when it exits non-zero. */
export function gitBytes(args: readonly string[], cwd?: string, stdin?: Uint8Array): Buffer {
  const result = gitResult(args, cwd, stdin);
  if (result.exitCode !== 0) throw failure(args, cwd, result);
  return result.stdout;
}

/** git's stdout as text; throws with git's stderr when it exits non-zero. */
export function git(args: readonly string[], cwd?: string): string {
  return gitBytes(args, cwd).toString();
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
