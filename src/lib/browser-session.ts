import { existsSync, readFileSync } from 'node:fs';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { Database } from 'bun:sqlite';
import { chromium, firefox } from 'playwright';
import type { AuthConfig } from '../types/index.js';

interface LoginConfigRaw {
  mdApiKey?: string;
  mdPolicy?: string;
  mdSignature?: string;
  mdauthtoken?: string;
  uid?: number | null;
}

function getChromeCookieValue(cookieName: string, domain: string): string | null {
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

    const db = new Database(cookiesPath, { readonly: true });
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

function extractUidFromJwt(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
    return payload.uids ? String(payload.uids) : null;
  } catch {
    return null;
  }
}

export interface BrowserSessionOptions {
  browser: 'chrome' | 'firefox';
  timeout?: number;
}

const CHROME_PROFILE_PATHS: Record<string, string> = {
  darwin: join(homedir(), 'Library', 'Application Support', 'Google', 'Chrome'),
  win32: join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data'),
  linux: join(homedir(), '.config', 'google-chrome'),
};

const FIREFOX_PROFILE_PARENT_PATHS: Record<string, string> = {
  darwin: join(homedir(), 'Library', 'Application Support', 'Firefox'),
  win32: join(process.env.APPDATA || '', 'Mozilla', 'Firefox'),
  linux: join(homedir(), '.mozilla', 'firefox'),
};

function getChromeProfilePath(): string {
  const platform = process.platform;
  const profilePath = CHROME_PROFILE_PATHS[platform];

  if (!profilePath) {
    throw new Error(`Unsupported platform: ${platform}. Only macOS, Windows, and Linux are supported.`);
  }

  if (!existsSync(profilePath)) {
    throw new Error(`Chrome not found. Expected profile at: ${profilePath}\nTry: mdcli auth login --session firefox or --browser`);
  }

  return profilePath;
}

interface FirefoxProfile {
  name: string;
  path: string;
  isRelative: boolean;
  isDefault: boolean;
}

function isCompleteProfile(profile: Partial<FirefoxProfile> | null): profile is FirefoxProfile {
  return profile !== null && profile.name !== undefined && profile.path !== undefined;
}

function pushIfComplete(profiles: FirefoxProfile[], profile: Partial<FirefoxProfile> | null): void {
  if (isCompleteProfile(profile)) {
    profiles.push(profile);
  }
}

function parseFirefoxProfilesIni(iniPath: string): FirefoxProfile[] {
  const content = readFileSync(iniPath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const profiles: FirefoxProfile[] = [];
  const isProfileSection = /^\[Profile\d+\]$/;

  let currentProfile: Partial<FirefoxProfile> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (isProfileSection.test(trimmed)) {
      pushIfComplete(profiles, currentProfile);
      currentProfile = { isDefault: false, isRelative: true };
      continue;
    }

    if (trimmed.startsWith('[')) {
      pushIfComplete(profiles, currentProfile);
      currentProfile = null;
      continue;
    }

    if (!currentProfile) continue;

    const [key, ...valueParts] = trimmed.split('=');
    const value = valueParts.join('=');

    switch (key) {
      case 'Name':
        currentProfile.name = value;
        break;
      case 'Path':
        currentProfile.path = value;
        break;
      case 'IsRelative':
        currentProfile.isRelative = value === '1';
        break;
      case 'Default':
        currentProfile.isDefault = value === '1';
        break;
    }
  }

  pushIfComplete(profiles, currentProfile);

  return profiles;
}

function getFirefoxProfilePath(): string {
  const platform = process.platform;
  const firefoxDir = FIREFOX_PROFILE_PARENT_PATHS[platform];

  if (!firefoxDir) {
    throw new Error(`Unsupported platform: ${platform}. Only macOS, Windows, and Linux are supported.`);
  }

  if (!existsSync(firefoxDir)) {
    throw new Error(`Firefox not found. Expected at: ${firefoxDir}\nTry: mdcli auth login --session chrome or --browser`);
  }

  const profilesIniPath = join(firefoxDir, 'profiles.ini');
  if (!existsSync(profilesIniPath)) {
    throw new Error(`Firefox profiles.ini not found at: ${profilesIniPath}\nTry: mdcli auth login --session chrome or --browser`);
  }

  const profiles = parseFirefoxProfilesIni(profilesIniPath);

  if (profiles.length === 0) {
    throw new Error(`No Firefox profiles found in: ${profilesIniPath}\nTry: mdcli auth login --session chrome or --browser`);
  }

  const defaultProfile = profiles.find((p) => p.isDefault) ?? profiles[0];

  const profilePath = defaultProfile.isRelative
    ? join(firefoxDir, defaultProfile.path)
    : defaultProfile.path;

  if (!existsSync(profilePath)) {
    throw new Error(`Firefox profile not found at: ${profilePath}\nTry: mdcli auth login --session chrome or --browser`);
  }

  return profilePath;
}

async function copyProfileToTemp(profilePath: string, excludeLocks = true): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), 'mdcli-profile-'));
  try {
    await cp(profilePath, tempDir, {
      recursive: true,
      filter: excludeLocks
        ? (src) => !src.endsWith('SingletonLock') && !src.endsWith('SingletonCookie') && !src.endsWith('SingletonSocket')
        : undefined,
    });
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});

    if (error instanceof Error && 'code' in error && error.code === 'EACCES') {
      throw new Error(
        `Cannot access browser profile at: ${profilePath}\nPermission denied. Check file permissions or close the browser and try again.`
      );
    }
    throw error;
  }
  return tempDir;
}

async function cleanupTempDir(tempDir: string): Promise<void> {
  await rm(tempDir, { recursive: true, force: true });
}

export async function extractSessionFromBrowser(
  options?: BrowserSessionOptions
): Promise<AuthConfig> {
  const browserType = options?.browser ?? 'chrome';
  const profilePath = browserType === 'chrome' ? getChromeProfilePath() : getFirefoxProfilePath();

  let tempDir: string | null = null;

  try {
    tempDir = await copyProfileToTemp(profilePath);

    const browserLauncher = browserType === 'chrome' ? chromium : firefox;
    const context = await browserLauncher.launchPersistentContext(tempDir, {
      headless: true,
      channel: browserType === 'chrome' ? 'chrome' : undefined,
    });

    try {
      const page = context.pages()[0] ?? (await context.newPage());

      // Capture loginconfig via setter trap - prevents losing it if page redirects to dashboard
      await page.addInitScript(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const browserWindow = globalThis as any;
        Object.defineProperty(browserWindow, 'loginconfig', {
          set(value: unknown) {
            browserWindow.__captured_loginconfig = value;
            Object.defineProperty(browserWindow, 'loginconfig', { value, writable: true });
          },
          configurable: true,
        });
      });

      await page.goto('https://app.meudinheiroweb.com.br/', { waitUntil: 'domcontentloaded' });

      const loginConfig = await page.evaluate((): LoginConfigRaw | null => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const browserWindow = globalThis as any;
        const config = browserWindow.__captured_loginconfig || browserWindow.loginconfig;
        if (!config) return null;
        return {
          mdApiKey: config.mdApiKey,
          mdPolicy: config.mdPolicy,
          mdSignature: config.mdSignature,
          mdauthtoken: config.mdauthtoken,
          uid: config.uid,
        };
      });

      const cookies = await context.cookies('https://app.meudinheiroweb.com.br/');
      const authCookie = cookies.find((c) => c.name === 'mdauthtoken0');

      let token = loginConfig?.mdauthtoken ?? authCookie?.value ?? '';

      if (!token && browserType === 'chrome') {
        token = getChromeCookieValue('mdauthtoken0', '.meudinheiroweb.com.br') ?? '';
      }

      if (!loginConfig) {
        throw new Error('User is not logged into MeuDinheiro. Try: mdcli auth login --browser');
      }

      if (!loginConfig.mdApiKey || !loginConfig.mdPolicy || !loginConfig.mdSignature) {
        throw new Error(
          'Failed to extract authentication config from page. The site structure may have changed.\nTry: mdcli auth login --browser'
        );
      }

      let uid = loginConfig.uid != null ? String(loginConfig.uid) : extractUidFromJwt(token);

      // Fallback: read uid from localStorage rememberedUsers
      if (!uid) {
        uid = await page.evaluate(() => {
          try {
            const rememberedUsers = localStorage.getItem('meudinheiro::rememberedUsers');
            if (!rememberedUsers) return null;
            const users = JSON.parse(rememberedUsers);
            return users[0]?.id ? String(users[0].id) : null;
          } catch {
            return null;
          }
        });
      }

      if (!uid) {
        throw new Error('Could not determine user ID. Try: mdcli auth login --browser');
      }

      return {
        token,
        apiKey: loginConfig.mdApiKey,
        policy: decodeURIComponent(loginConfig.mdPolicy),
        signature: decodeURIComponent(loginConfig.mdSignature),
        uid,
      };
    } finally {
      await context.close();
    }
  } finally {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  }
}
