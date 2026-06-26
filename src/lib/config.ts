import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { AliasMap, AuthConfig, AuthMethod, MdcliConfig } from '../types/index.js';

const CONFIG_DIR = join(homedir(), '.config', 'mdcli');
const CONFIG_FILE = join(CONFIG_DIR, 'mdcli.config.json');

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function loadConfig(): MdcliConfig {
  ensureConfigDir();
  
  if (!existsSync(CONFIG_FILE)) {
    return {};
  }

  try {
    const data = readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(data) as MdcliConfig;
  } catch {
    return {};
  }
}

function saveConfig(config: MdcliConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
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
  return CONFIG_FILE;
}

export function getFullConfig(): MdcliConfig {
  return loadConfig();
}

export function setAliases(aliases: AliasMap): void {
  const config = loadConfig();
  config.aliases = aliases;
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
