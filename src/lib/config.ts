import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { AliasMap, AuthConfig, AuthMethod, MdcliConfig, NameCache, AliasType, NameCacheEntry } from '../types/index.js';

// Resolved on every call, not at import time, so MDCLI_CONFIG_DIR (or HOME)
// set after this module loads still decides where the config lives.
function configDir(): string {
  return process.env.MDCLI_CONFIG_DIR || join(homedir(), '.config', 'mdcli');
}

function configFile(): string {
  return join(configDir(), 'mdcli.config.json');
}

// The config holds session tokens, captchaApiKey and opItem: keep it private
// to the current user. chmod also tightens files created by older versions.
const CONFIG_DIR_MODE = 0o700;
const CONFIG_FILE_MODE = 0o600;

function restrictMode(path: string, mode: number): void {
  try {
    chmodSync(path, mode);
  } catch {
    // Best effort (e.g. Windows or a read-only filesystem).
  }
}

export function ensurePrivateDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: CONFIG_DIR_MODE });
  }
  restrictMode(dir, CONFIG_DIR_MODE);
}

export function writePrivateFile(file: string, data: string): void {
  writeFileSync(file, data, { encoding: 'utf-8', mode: CONFIG_FILE_MODE });
  restrictMode(file, CONFIG_FILE_MODE);
}

function ensureConfigDir(): void {
  ensurePrivateDir(configDir());
}

function loadConfig(): MdcliConfig {
  ensureConfigDir();
  
  const file = configFile();
  if (!existsSync(file)) {
    return {};
  }
  restrictMode(file, CONFIG_FILE_MODE);

  try {
    const data = readFileSync(file, 'utf-8');
    return JSON.parse(data) as MdcliConfig;
  } catch {
    return {};
  }
}

function saveConfig(config: MdcliConfig): void {
  ensureConfigDir();
  writePrivateFile(configFile(), JSON.stringify(config, null, 2));
}

export function getAuth(): AuthConfig | null {
  const config = loadConfig();
  return config.auth ?? null;
}

export function setAuth(auth: AuthConfig, method?: AuthMethod): void {
  const config = loadConfig();
  config.auth = auth;
  if (method) {
    config.authMethod = method;
  }
  config.lastUpdated = new Date().toISOString();
  saveConfig(config);
}

export function clearAuth(includePreferences = false): void {
  const config = loadConfig();
  delete config.auth;
  delete config.authMethod;
  delete config.lastUpdated;
  if (includePreferences) {
    delete config.opItem;
    delete config.captchaApiKey;
  }
  saveConfig(config);
}

export function getAuthMethod(): AuthMethod | null {
  const config = loadConfig();
  return config.authMethod ?? null;
}

export function hasAuth(): boolean {
  return getAuth() !== null;
}

export function getConfigPath(): string {
  return configFile();
}

export function getFullConfig(): MdcliConfig {
  return loadConfig();
}

export function setAliases(aliases: AliasMap): void {
  const config = loadConfig();
  config.aliases = aliases;
  saveConfig(config);
}

export function getNameCache(): NameCache {
  const config = loadConfig();
  return config.nameCache ?? {};
}

export function setNameCacheEntry(type: AliasType, entry: NameCacheEntry): void {
  const config = loadConfig();
  config.nameCache = { ...config.nameCache, [type]: entry };
  saveConfig(config);
}

export function invalidateNameCache(type?: AliasType): void {
  const config = loadConfig();
  if (!config.nameCache) return;
  if (type) {
    delete config.nameCache[type];
    if (Object.keys(config.nameCache).length === 0) {
      delete config.nameCache;
    }
  } else {
    delete config.nameCache;
  }
  saveConfig(config);
}

export function getOpItem(): string | null {
  const config = loadConfig();
  return config.opItem ?? null;
}

export function setOpItem(itemName: string): void {
  const config = loadConfig();
  config.opItem = itemName;
  saveConfig(config);
}

export function getCaptchaApiKey(): string | null {
  const config = loadConfig();
  return config.captchaApiKey ?? null;
}

export function setCaptchaApiKey(apiKey: string): void {
  const config = loadConfig();
  config.captchaApiKey = apiKey;
  saveConfig(config);
}
