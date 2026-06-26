import { getFullConfig, setAliases } from './config.js';
import { getNameIndex } from './name-cache.js';
import type { Alias, AliasMap, AliasType } from '../types/index.js';

function loadAliases(): AliasMap {
  const config = getFullConfig();
  return {
    accounts: config.aliases?.accounts ?? [],
    categories: config.aliases?.categories ?? [],
    tags: config.aliases?.tags ?? [],
  };
}

function saveAliases(aliases: AliasMap): void {
  setAliases(aliases);
}

export function getAliases(type: AliasType): Alias[] {
  return loadAliases()[type];
}

export function addAlias(type: AliasType, id: number, name: string): { success: boolean; error?: string } {
  const aliases = loadAliases();
  const list = aliases[type];

  const nameExists = list.some((a) => a.name === name);
  if (nameExists) {
    return { success: false, error: `Alias "${name}" already exists` };
  }

  const existingForId = list.find((a) => a.id === id);
  if (existingForId) {
    return { success: false, error: `ID ${id} already has alias "${existingForId.name}"` };
  }

  list.push({ id, name });
  saveAliases(aliases);
  return { success: true };
}

export function updateAlias(type: AliasType, id: number, newName: string): { success: boolean; error?: string } {
  const aliases = loadAliases();
  const list = aliases[type];

  const index = list.findIndex((a) => a.id === id);
  if (index === -1) {
    return { success: false, error: `No alias found for ID ${id}` };
  }

  const nameConflicts = list.some((a, i) => i !== index && a.name === newName);
  if (nameConflicts) {
    return { success: false, error: `Alias "${newName}" already exists` };
  }

  list[index].name = newName;
  saveAliases(aliases);
  return { success: true };
}

export function removeAlias(type: AliasType, identifier: string): { success: boolean; error?: string } {
  const aliases = loadAliases();
  const list = aliases[type];

  const numId = Number(identifier);
  let index = !Number.isNaN(numId) ? list.findIndex((a) => a.id === numId) : -1;

  if (index === -1) {
    index = list.findIndex((a) => a.name === identifier);
  }

  if (index === -1) {
    return { success: false, error: `No alias found for "${identifier}"` };
  }

  list.splice(index, 1);
  saveAliases(aliases);
  return { success: true };
}

export async function resolveId(type: AliasType, input: string): Promise<number | null> {
  const num = Number(input);
  if (!Number.isNaN(num)) {
    return num;
  }

  const aliases = loadAliases()[type];
  const alias = aliases.find((a) => a.name === input);
  if (alias) {
    return alias.id;
  }

  const index = await getNameIndex(type);
  return index[input.toLowerCase()] ?? null;
}

export async function resolveIds(type: AliasType, input: string): Promise<{ ids: number[]; unresolved: string[] }> {
  const parts = input.split(',').map((s) => s.trim());
  const ids: number[] = [];
  const remaining: string[] = [];

  for (const part of parts) {
    const num = Number(part);
    if (!Number.isNaN(num)) {
      ids.push(num);
      continue;
    }
    const alias = loadAliases()[type].find((a) => a.name === part);
    if (alias) {
      ids.push(alias.id);
      continue;
    }
    remaining.push(part);
  }

  if (remaining.length === 0) {
    return { ids, unresolved: [] };
  }

  const index = await getNameIndex(type);
  const unresolved: string[] = [];
  for (const part of remaining) {
    const id = index[part.toLowerCase()];
    if (id !== undefined) {
      ids.push(id);
    } else {
      unresolved.push(part);
    }
  }

  return { ids, unresolved };
}
