import type { AliasType } from '../types/index.js';

const INVALIDATION_WINDOW_MS = 60_000;

let lastCacheUse: { type: AliasType; at: number } | null = null;

export function markNameCacheUsed(type: AliasType): void {
  lastCacheUse = { type, at: Date.now() };
}

export function popStaleNameCacheUse(): AliasType | null {
  if (!lastCacheUse) return null;
  if (Date.now() - lastCacheUse.at > INVALIDATION_WINDOW_MS) {
    lastCacheUse = null;
    return null;
  }
  const type = lastCacheUse.type;
  lastCacheUse = null;
  return type;
}
