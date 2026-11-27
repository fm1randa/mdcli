import type { Alias, AliasMap, AuthConfig, AuthMethod, MdcliConfig, NameCache, NameCacheEntry } from '../types/index.js';
import { asRecord, numberOrNull, textOrNull } from './payload.js';

// mdcli.config.json is user-editable: every field is checked here, and one
// that does not match its type falls back to the default (absent), so a broken
// file reads as a fresh config instead of crashing a command (#362).

const AUTH_METHODS: readonly AuthMethod[] = ['browser-chrome', 'browser-firefox', 'browser-edge', '1password', 'browser-manual', 'manual'];

function authMethodOrNull(value: unknown): AuthMethod | null {
  return AUTH_METHODS.find((method) => method === value) ?? null;
}

function parseAuth(value: unknown): AuthConfig | null {
  const auth = asRecord(value);
  const apiKey = textOrNull(auth?.apiKey);
  const uid = textOrNull(auth?.uid);
  if (apiKey === null || uid === null) return null;
  if (auth?.token === undefined) return { apiKey, uid };
  const token = textOrNull(auth.token);
  return token === null ? null : { apiKey, uid, token };
}

function parseAliasList(value: unknown): Alias[] | null {
  if (!Array.isArray(value)) return null;
  const items: unknown[] = value;
  const aliases: Alias[] = [];
  for (const item of items) {
    const alias = asRecord(item);
    const id = numberOrNull(alias?.id);
    const name = textOrNull(alias?.name);
    if (id === null || name === null) return null;
    aliases.push({ id, name });
  }
  return aliases;
}

function parseAliases(value: unknown): AliasMap | null {
  const map = asRecord(value);
  const accounts = parseAliasList(map?.accounts);
  const categories = parseAliasList(map?.categories);
  const tags = parseAliasList(map?.tags);
  return accounts && categories && tags ? { accounts, categories, tags } : null;
}

function parseNameCacheEntry(value: unknown): NameCacheEntry | null {
  const entry = asRecord(value);
  const cachedAt = textOrNull(entry?.cachedAt);
  const names = asRecord(entry?.byName);
  if (cachedAt === null || names === null) return null;
  const byName: Record<string, number> = {};
  for (const [name, raw] of Object.entries(names)) {
    const id = numberOrNull(raw);
    if (id === null) return null;
    byName[name] = id;
  }
  return { byName, cachedAt };
}

function parseNameCache(value: unknown): NameCache | null {
  const raw = asRecord(value);
  const cache: NameCache = {};
  for (const type of ['accounts', 'categories', 'tags'] as const) {
    const entry = parseNameCacheEntry(raw?.[type]);
    if (entry) cache[type] = entry;
  }
  return Object.keys(cache).length > 0 ? cache : null;
}

/** The config a parsed mdcli.config.json holds, keeping only the fields that
 * match MdcliConfig; anything else (not an object, a wrong field) is dropped. */
export function parseConfig(value: unknown): MdcliConfig {
  const raw = asRecord(value);
  if (raw === null) return {};
  const config: MdcliConfig = {};
  const auth = parseAuth(raw.auth);
  if (auth) config.auth = auth;
  const authMethod = authMethodOrNull(raw.authMethod);
  if (authMethod) config.authMethod = authMethod;
  const lastUpdated = textOrNull(raw.lastUpdated);
  if (lastUpdated !== null) config.lastUpdated = lastUpdated;
  const aliases = parseAliases(raw.aliases);
  if (aliases) config.aliases = aliases;
  const nameCache = parseNameCache(raw.nameCache);
  if (nameCache) config.nameCache = nameCache;
  const opItem = textOrNull(raw.opItem);
  if (opItem !== null) config.opItem = opItem;
  const captchaApiKey = textOrNull(raw.captchaApiKey);
  if (captchaApiKey !== null) config.captchaApiKey = captchaApiKey;
  if (typeof raw.autoUpdate === 'boolean') config.autoUpdate = raw.autoUpdate;
  return config;
}
