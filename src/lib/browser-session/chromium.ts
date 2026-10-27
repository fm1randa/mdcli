import { t } from '../i18n/index.js';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { Database } from 'bun:sqlite';
import { isMacOsSandboxError } from './profile-copy.js';

export function getChromeCookieValue(cookieName: string, domain: string): string | null {
  if (process.platform !== 'darwin') {
    return null;
  }

  try {
    const chromeDir = join(homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
    const cookiesPath = join(chromeDir, 'Default', 'Cookies');

    if (!existsSync(cookiesPath)) {
      return null;
    }

    const safeStorageKey = execSync('security find-generic-password -s "Chrome Safe Storage" -w', {
      encoding: 'utf-8',
    }).trim();

    const derivedKey = pbkdf2Sync(safeStorageKey, 'saltysalt', 1003, 16, 'sha1');

    // immutable=1 reads the file without taking a lock Chrome already holds
    const db = new Database(`${pathToFileURL(cookiesPath).href}?immutable=1`, { readonly: true });
    const row = db.query(
      'SELECT encrypted_value FROM cookies WHERE name = ? AND host_key = ?'
    ).get(cookieName, domain) as { encrypted_value: Uint8Array } | null;
    db.close();

    if (!row?.encrypted_value) {
      return null;
    }

    const encryptedValue = Buffer.from(row.encrypted_value);

    if (encryptedValue.slice(0, 3).toString() !== 'v10') {
      return null;
    }

    const iv = Buffer.alloc(16, ' ');
    const decipher = createDecipheriv('aes-128-cbc', derivedKey, iv);
    const decrypted = Buffer.concat([
      decipher.update(encryptedValue.slice(3)),
      decipher.final(),
    ]);

    const jwtStart = decrypted.indexOf('eyJ');
    if (jwtStart < 0) {
      return null;
    }

    const lastByte = decrypted[decrypted.length - 1];
    const jwtEnd = lastByte <= 16 ? decrypted.length - lastByte : decrypted.length;

    return decrypted.slice(jwtStart, jwtEnd).toString('utf-8');
  } catch {
    return null;
  }
}

const CHROME_PROFILE_PATHS: Record<string, string> = {
  darwin: join(homedir(), 'Library', 'Application Support', 'Google', 'Chrome'),
  win32: join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data'),
  linux: join(homedir(), '.config', 'google-chrome'),
};

const EDGE_PROFILE_PATHS: Record<string, string> = {
  darwin: join(homedir(), 'Library', 'Application Support', 'Microsoft Edge'),
  win32: join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'User Data'),
  linux: join(homedir(), '.config', 'microsoft-edge'),
};

function getChromiumProfilePath(paths: Record<string, string>, label: string): string {
  const platform = process.platform;
  const profilePath = paths[platform];

  if (!profilePath) {
    throw new Error(t('errorUnsupportedPlatform', platform));
  }

  if (!existsSync(profilePath)) {
    throw new Error(t('errorBrowserProfileNotFound', label, profilePath));
  }

  return profilePath;
}

export function getChromeProfilePath(): string {
  return getChromiumProfilePath(CHROME_PROFILE_PATHS, 'Chrome');
}

export function getEdgeProfilePath(): string {
  return getChromiumProfilePath(EDGE_PROFILE_PATHS, 'Edge');
}

function checkChromiumProfileReadable(getPath: () => string): { ok: true } | { ok: false; reason: string } {
  let profilePath: string;
  try {
    profilePath = getPath();
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'Browser profile not found' };
  }

  try {
    readdirSync(profilePath);
    return { ok: true };
  } catch (error) {
    const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : '';
    if (isMacOsSandboxError(code)) {
      return {
        ok: false,
        reason:
          'macOS is blocking access (Full Disk Access needed). ' +
          'Open System Settings -> Privacy & Security -> Full Disk Access and enable it for this terminal app.',
      };
    }
    return { ok: false, reason: error instanceof Error ? error.message : 'Unknown error reading profile' };
  }
}

export function checkChromeProfileReadable(): { ok: true } | { ok: false; reason: string } {
  return checkChromiumProfileReadable(getChromeProfilePath);
}

export function checkEdgeProfileReadable(): { ok: true } | { ok: false; reason: string } {
  return checkChromiumProfileReadable(getEdgeProfilePath);
}
