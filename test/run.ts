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

export interface IgnoredChild {
  readonly exited: Promise<number>;
}

export interface IgnoredOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
}

export function spawnIgnored(command: readonly string[], options: IgnoredOptions = {}): IgnoredChild {
  const proc = Bun.spawn([...command], {
    cwd: options.cwd,
    env: options.env,
    stdout: 'ignore',
    stderr: 'ignore',
  });
  return { exited: proc.exited };
}

export interface TerminalChild {
  readonly exited: Promise<number>;
  exitCode(): number | null;
  write(data: string): void;
  kill(): void;
  close(): void;
}

export interface TerminalOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  cols: number;
  rows: number;
  onData(chunk: Uint8Array): void;
}

export function attachTerminal(command: readonly string[], options: TerminalOptions): TerminalChild {
  const proc = Bun.spawn([...command], {
    cwd: options.cwd,
    env: options.env,
    terminal: {
      cols: options.cols,
      rows: options.rows,
      data(_terminal, chunk) {
        options.onData(chunk);
      },
    },
  });
  const terminal = proc.terminal;
  if (!terminal) throw new Error('Bun.spawn returned no terminal');
  return {
    exited: proc.exited,
    exitCode: () => proc.exitCode,
    write(data) {
      terminal.write(data);
    },
    kill() {
      proc.kill();
    },
    close() {
      terminal.close();
    },
  };
}
