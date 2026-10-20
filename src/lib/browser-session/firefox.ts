import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { homedir } from 'node:os';
import { isMacOsSandboxError } from './profile-copy.js';

const FIREFOX_PROFILE_PARENT_PATHS: Record<string, string> = {
  darwin: join(homedir(), 'Library', 'Application Support', 'Firefox'),
  win32: join(process.env.APPDATA || '', 'Mozilla', 'Firefox'),
  linux: join(homedir(), '.mozilla', 'firefox'),
};

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
          `Alternatively, try: mdcli auth login --session chrome or --browser`,
        { cause: error }
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
