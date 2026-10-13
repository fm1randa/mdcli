import type { AuthConfig } from './api.js';

export type AliasType = 'accounts' | 'categories' | 'tags';

export interface Alias {
  id: number;
  name: string;
}

export interface AliasMap {
  accounts: Alias[];
  categories: Alias[];
  tags: Alias[];
}

export interface NameCacheEntry {
  byName: Record<string, number>;
  cachedAt: string;
}

export interface NameCache {
  accounts?: NameCacheEntry;
  categories?: NameCacheEntry;
  tags?: NameCacheEntry;
}

export type AuthMethod = 'browser-chrome' | 'browser-firefox' | 'browser-edge' | '1password' | 'browser-manual' | 'manual';

export interface MdcliConfig {
  auth?: AuthConfig;
  authMethod?: AuthMethod;
  lastUpdated?: string;
  aliases?: AliasMap;
  nameCache?: NameCache;
  opItem?: string;
  captchaApiKey?: string;
  /** false turns off the background self-update check. */
  autoUpdate?: boolean;
}
