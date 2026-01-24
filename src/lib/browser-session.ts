import { existsSync, readFileSync } from 'node:fs';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { chromium, firefox } from 'playwright';
import type { AuthConfig } from '../types/index.js';

interface LoginConfigRaw {
  mdApiKey?: string;
  mdPolicy?: string;
  mdSignature?: string;
  uid?: number | null;
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

export function getChromeProfilePath(): string {
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

export async function copyProfileToTemp(profilePath: string): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), 'mdcli-profile-'));
  await cp(profilePath, tempDir, { recursive: true });
  return tempDir;
}

export async function cleanupTempDir(tempDir: string): Promise<void> {
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
      headless: false,
      channel: browserType === 'chrome' ? 'chrome' : undefined,
    });

    try {
      const page = context.pages()[0] ?? (await context.newPage());

      // Task 3.2: Navigate and extract window.loginconfig
      await page.goto('https://app.meudinheiroweb.com.br/', { waitUntil: 'domcontentloaded' });

      const loginConfig = await page.evaluate((): LoginConfigRaw | null => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const browserWindow = globalThis as any;
        const config = browserWindow.loginconfig;
        if (!config) return null;
        return {
          mdApiKey: config.mdApiKey,
          mdPolicy: config.mdPolicy,
          mdSignature: config.mdSignature,
          uid: config.uid,
        };
      });

      const cookies = await context.cookies();
      const authCookie = cookies.find((c) => c.name === 'mdauthtoken0');
      const token = authCookie?.value ?? '';

      if (!loginConfig || loginConfig.uid === null || loginConfig.uid === undefined) {
        throw new Error('User is not logged into MeuDinheiro. Try: mdcli auth login --browser');
      }

      throw new Error(
        `Not fully implemented: extraction logic pending (Task 3.5). Config extracted: ${JSON.stringify(loginConfig)}, Token: ${token ? 'present' : 'missing'}`
      );
    } finally {
      await context.close();
    }
  } finally {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  }
}
