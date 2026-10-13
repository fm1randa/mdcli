import { cp, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export function isMacOsSandboxError(code: string): boolean {
  return process.platform === 'darwin' && (code === 'EPERM' || code === 'EACCES');
}

/** Runtime lock files must not travel into a copied profile: a stale lock can
 * make the launched copy refuse the profile as "already in use". Matched by
 * exact basename so similarly-named data files are still copied. */
function isBrowserLockFile(src: string): boolean {
  const base = src.split(/[\\/]/).pop() ?? src;
  return (
    base === 'SingletonLock' ||
    base === 'SingletonCookie' ||
    base === 'SingletonSocket' ||
    base === 'lock' ||
    base === '.parentlock'
  );
}

/** Suggests login alternatives other than the browser that just failed. */
function sessionAlternatives(failedBrowser: string): string {
  const others = ['chrome', 'edge', 'firefox'].filter((b) => b !== failedBrowser);
  return [...others.map((b) => `--session ${b}`), '--browser'].join(' or ');
}

export async function copyProfileToTemp(profilePath: string, browserType: string, excludeLocks = true): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), 'mdcli-profile-'));
  try {
    await cp(profilePath, tempDir, {
      recursive: true,
      filter: excludeLocks ? (src) => !isBrowserLockFile(src) : undefined,
    });
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});

    if (error instanceof Error && 'code' in error && typeof error.code === 'string' && isMacOsSandboxError(error.code)) {
      throw new Error(
        `macOS blocked access to the browser profile at: ${profilePath}\n` +
          `This is caused by macOS privacy protection (TCC), not a bug in mdcli. To fix it:\n` +
          `  1. Open System Settings -> Privacy & Security -> Full Disk Access\n` +
          `  2. Enable it for the terminal app you're running mdcli from (Terminal, iTerm, VS Code, etc.)\n` +
          `  3. Restart the terminal and try again\n` +
          `Alternatively, try: mdcli auth login ${sessionAlternatives(browserType)}`
      );
    }
    throw error;
  }
  return tempDir;
}

function isTransientFsError(code: string): boolean {
  return code === 'EBUSY' || code === 'EPERM' || code === 'ENOTEMPTY';
}

export async function cleanupTempDir(tempDir: string): Promise<void> {
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await rm(tempDir, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : '';
      const isLastAttempt = attempt === maxAttempts;

      if (isLastAttempt || !isTransientFsError(code)) {
        // Best-effort cleanup: a leftover temp profile copy should never mask
        // a successful auth result (e.g. the browser process on Windows can
        // hold a file handle open briefly after context.close() resolves).
        console.warn(`⚠ Could not remove temporary profile copy at ${tempDir}. You can delete it manually.`);
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
}
