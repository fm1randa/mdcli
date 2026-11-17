import { execSync, spawnSync } from 'node:child_process';

export interface InheritedShellResult {
  error: Error | undefined;
  status: number | null;
  signal: string | null;
}

/** `$EDITOR` may itself contain arguments (`code --wait`), so the command runs through a shell. */
export function runInheritedShell(command: string): InheritedShellResult {
  const result = spawnSync(command, { shell: true, stdio: 'inherit' });
  return {
    error: result.error,
    status: result.status,
    signal: result.signal,
  };
}

export function readCommandStdout(command: string): string {
  return execSync(command, { encoding: 'utf-8' });
}
