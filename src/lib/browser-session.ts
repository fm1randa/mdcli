import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { AuthConfig } from '../types/index.js';

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

export async function extractSessionFromBrowser(
  _options?: BrowserSessionOptions
): Promise<AuthConfig> {
  // TODO: Implement
  throw new Error('Not implemented');
}
