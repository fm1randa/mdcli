import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { Database } from 'bun:sqlite';
import { chromium, firefox } from 'playwright';
import type { AuthConfig } from '../types/index.js';

const API_URL_PATTERN = 'app.meudinheiroweb.com.br/api/';

interface LoginConfigRaw {
  mdApiKey?: string;
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
  browser: 'chrome' | 'firefox' | 'edge';
  timeout?: number;
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

const FIREFOX_PROFILE_PARENT_PATHS: Record<string, string> = {
  darwin: join(homedir(), 'Library', 'Application Support', 'Firefox'),
  win32: join(process.env.APPDATA || '', 'Mozilla', 'Firefox'),
  linux: join(homedir(), '.mozilla', 'firefox'),
};

function getChromiumProfilePath(paths: Record<string, string>, label: string): string {
  const platform = process.platform;
  const profilePath = paths[platform];

  if (!profilePath) {
    throw new Error(`Unsupported platform: ${platform}. Only macOS, Windows, and Linux are supported.`);
  }

  if (!existsSync(profilePath)) {
    throw new Error(`${label} not found. Expected profile at: ${profilePath}\nTry: mdcli auth login --session firefox or --browser`);
  }

  return profilePath;
}

export function getChromeProfilePath(): string {
  return getChromiumProfilePath(CHROME_PROFILE_PATHS, 'Chrome');
}

export function getEdgeProfilePath(): string {
  return getChromiumProfilePath(EDGE_PROFILE_PATHS, 'Edge');
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

/**
 * Reads the profiles chosen by Firefox installer sections ([Install*]
 * Default=...). Returns every non-empty default in file order. Callers
 * should only trust the result when exactly one install is present: with
 * several Firefox installs (release, ESR, Developer Edition) there is no
 * way to know which one the user runs, and the legacy Default=1 flag is
 * the better guess.
 */
export function parseFirefoxInstallDefaults(iniPath: string): string[] {
  const content = readFileSync(iniPath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const isInstallSection = /^\[Install[^\]]*\]$/;

  const defaults: string[] = [];
  let inInstallSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('[')) {
      inInstallSection = isInstallSection.test(trimmed);
      continue;
    }

    if (!inInstallSection) continue;

    const [key, ...valueParts] = trimmed.split('=');
    if (key === 'Default') {
      const value = valueParts.join('=').trim();
      if (value !== '') {
        defaults.push(value);
      }
    }
  }

  return defaults;
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

export function getFirefoxProfilePath(): string {
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

  let profiles: FirefoxProfile[];
  try {
    profiles = parseFirefoxProfilesIni(profilesIniPath);
  } catch (error) {
    const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : '';
    if (isMacOsSandboxError(code)) {
      throw new Error(
        `macOS blocked access to the Firefox profile at: ${profilesIniPath}\n` +
          `This is caused by macOS privacy protection (TCC), not a bug in mdcli. To fix it:\n` +
          `  1. Open System Settings -> Privacy & Security -> Full Disk Access\n` +
          `  2. Enable it for the terminal app you're running mdcli from (Terminal, iTerm, VS Code, etc.)\n` +
          `  3. Restart the terminal and try again\n` +
          `Alternatively, try: mdcli auth login --session chrome or --browser`
      );
    }
    throw error;
  }

  if (profiles.length === 0) {
    throw new Error(`No Firefox profiles found in: ${profilesIniPath}\nTry: mdcli auth login --session chrome or --browser`);
  }

  // Prefer the install-section default (the profile actually in use) over the
  // legacy Default=1 flag, which can point at an older migrated-away profile.
  // With several Firefox installs the default is ambiguous, so fall back to
  // the legacy flag instead of guessing the wrong installation.
  const installDefaults = parseFirefoxInstallDefaults(profilesIniPath);
  const installDefault = installDefaults.length === 1 ? installDefaults[0] : null;
  if (installDefault) {
    const installPath = isAbsolute(installDefault) ? installDefault : join(firefoxDir, installDefault);
    if (existsSync(installPath)) {
      return installPath;
    }
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

function isMacOsSandboxError(code: string): boolean {
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

async function copyProfileToTemp(profilePath: string, browserType: string, excludeLocks = true): Promise<string> {
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

async function cleanupTempDir(tempDir: string): Promise<void> {
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

export async function extractSessionFromBrowser(
  options?: BrowserSessionOptions
): Promise<AuthConfig> {
  const browserType = options?.browser ?? 'chrome';
  const profilePath =
    browserType === 'chrome'
      ? getChromeProfilePath()
      : browserType === 'edge'
        ? getEdgeProfilePath()
        : getFirefoxProfilePath();

  let tempDir: string | null = null;

  try {
    tempDir = await copyProfileToTemp(profilePath, browserType);

    const browserLauncher = browserType === 'firefox' ? firefox : chromium;
    const channel = browserType === 'chrome' ? 'chrome' : browserType === 'edge' ? 'msedge' : undefined;
    let context;
    try {
      context = await browserLauncher.launchPersistentContext(tempDir, {
        headless: true,
        channel,
        timeout: 30000,
      });
    } catch (error) {
      if (error instanceof Error && /Timeout .*exceeded/i.test(error.message)) {
        throw new Error(
          `Browser took too long to start with the copied profile (this can happen on managed/corporate ` +
            `machines where the browser tries to reach blocked network services on launch).\n` +
            `Try: mdcli auth login --browser or --item`
        );
      }
      throw error;
    }

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

      // Fallback signal: if the app is already authenticated, it skips the
      // login page entirely and goes straight to loading dashboard data --
      // loginconfig may never be set in that path, but the real API calls
      // still carry the auth headers, so capture those too. Authorization is
      // required: pre-login traffic can already send mdapikey/mduid, and
      // accepting it would save a token-less auth from a logged-out profile.
      const apiHeadersRef: { captured: Record<string, string> | null } = { captured: null };
      page.on('request', (request) => {
        if (apiHeadersRef.captured) return;
        const url = request.url();
        if (!url.includes(API_URL_PATTERN)) return;
        const headers = request.headers();
        if (headers['mdapikey'] && headers['mduid'] && headers['authorization']) {
          apiHeadersRef.captured = headers;
        }
      });

      await page.goto('https://app.meudinheiroweb.com.br/', { waitUntil: 'domcontentloaded' });

      // Wait for whichever signal shows up first: the Angular app setting
      // loginconfig (unauthenticated -> login page), or a real API request
      // carrying auth headers (already authenticated -> straight to
      // dashboard, loginconfig may never be set at all).
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline && !apiHeadersRef.captured) {
        // The SPA can navigate mid-poll (login -> dashboard), destroying the
        // execution context. A failed evaluate just means "not yet" — retry
        // until the deadline instead of failing the whole extraction.
        const hasLoginConfig = await page
          .evaluate(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const browserWindow = globalThis as any;
            return Boolean(browserWindow.__captured_loginconfig || browserWindow.loginconfig);
          })
          .catch(() => false);
        if (hasLoginConfig) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      const loginConfig = await page
        .evaluate((): LoginConfigRaw | null => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const browserWindow = globalThis as any;
          const config = browserWindow.__captured_loginconfig || browserWindow.loginconfig;
          if (!config) return null;
          return {
            mdApiKey: config.mdApiKey,
            mdauthtoken: config.mdauthtoken,
            uid: config.uid,
          };
        })
        // Same navigation hazard as above: fall through to the cookie and
        // captured-header fallbacks instead of throwing.
        .catch(() => null);

      const cookies = await context.cookies('https://app.meudinheiroweb.com.br/');
      const authCookie = cookies.find((c) => c.name === 'mdauthtoken0');

      const capturedApiHeaders = apiHeadersRef.captured;

      let token =
        loginConfig?.mdauthtoken ??
        authCookie?.value ??
        (capturedApiHeaders?.authorization?.replace(/^Bearer\s+/i, '') ?? '');

      if (!token && browserType === 'chrome') {
        token = getChromeCookieValue('mdauthtoken0', '.meudinheiroweb.com.br') ?? '';
      }

      const apiKey = loginConfig?.mdApiKey ?? capturedApiHeaders?.mdapikey;

      if (!apiKey) {
        if (!loginConfig && !capturedApiHeaders) {
          throw new Error('User is not logged into MeuDinheiro. Try: mdcli auth login --browser');
        }
        throw new Error(
          'Failed to extract authentication config from page. The site structure may have changed.\nTry: mdcli auth login --browser'
        );
      }

      let uid =
        loginConfig?.uid != null
          ? String(loginConfig.uid)
          : capturedApiHeaders?.mduid ?? extractUidFromJwt(token);

      // Fallback: read uid from localStorage rememberedUsers
      if (!uid) {
        // Same navigation hazard as above: a failed read must not fail the
        // extraction when a token was already recovered elsewhere.
        uid = await page
          .evaluate(() => {
            try {
              const rememberedUsers = localStorage.getItem('meudinheiro::rememberedUsers');
              if (!rememberedUsers) return null;
              const users = JSON.parse(rememberedUsers);
              return users[0]?.id ? String(users[0].id) : null;
            } catch {
              return null;
            }
          })
          .catch(() => null);
      }

      if (!uid) {
        throw new Error('Could not determine user ID. Try: mdcli auth login --browser');
      }

      return {
        apiKey,
        uid,
        ...(token ? { token } : {}),
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
