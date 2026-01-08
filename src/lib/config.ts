import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { AuthConfig, MdcliConfig } from '../types/index.js';

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

export function setAuth(auth: AuthConfig): void {
  const config = loadConfig();
  config.auth = auth;
  config.lastUpdated = new Date().toISOString();
  saveConfig(config);
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
