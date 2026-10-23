import { fetchAccounts, fetchCategories, fetchTags } from './api.js';
import { getNameCache, setNameCacheEntry } from './config.js';
import { markNameCacheUsed } from './cache-invalidation.js';
import type { AliasType } from '../types/index.js';

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** The form a name is matched by: case-insensitive. The name index is keyed by it. */
export function nameKey(name: string): string {
  return name.toLowerCase();
}

/** Two names that match, the way a name lookup matches them. */
export function sameName(a: string, b: string): boolean {
  return nameKey(a) === nameKey(b);
}

async function fetchItems(type: AliasType): Promise<{ id: number; nome: string }[]> {
  if (type === 'accounts') {
    const res = await fetchAccounts();
    return res.items.map((a) => ({ id: a.id, nome: a.nome }));
  }
  if (type === 'categories') {
    const res = await fetchCategories();
    return res.items.map((c) => ({ id: c.id, nome: c.nome }));
  }
  const res = await fetchTags();
  return res.map((t) => ({ id: t.id, nome: t.nome }));
}

function buildIndex(items: { id: number; nome: string }[]): Record<string, number> {
  const byName: Record<string, number> = {};
  for (const item of items) {
    byName[nameKey(item.nome)] = item.id;
  }
  return byName;
}

function isFresh(cachedAt: string | undefined): boolean {
  if (!cachedAt) return false;
  return Date.now() - new Date(cachedAt).getTime() < CACHE_TTL_MS;
}

export async function getNameIndex(type: AliasType): Promise<Record<string, number>> {
  const cache = getNameCache();
  const entry = cache[type];
  if (entry && isFresh(entry.cachedAt)) {
    markNameCacheUsed(type);
    return entry.byName;
  }
  const items = await fetchItems(type);
  const byName = buildIndex(items);
  setNameCacheEntry(type, { byName, cachedAt: new Date().toISOString() });
  markNameCacheUsed(type);
  return byName;
}
