/** A finished child's exit code and its output as text. */
export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  stdin?: string;
}

/**
 * Runs a child to completion with Bun.spawn: a parallel worker refuses
 * spawnSync (test/sync-spawn-guard.ts), so tests that drive a script as a user
 * does await this instead.
 */
export async function run(command: readonly string[], options: RunOptions = {}): Promise<RunResult> {
  const proc = Bun.spawn([...command], {
    cwd: options.cwd,
    env: options.env,
    stdin: options.stdin === undefined ? 'ignore' : Buffer.from(options.stdin),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}
