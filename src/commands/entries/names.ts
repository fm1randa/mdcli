import { fetchAccounts, fetchCategories, fetchTags } from '../../lib/api.js';
import type { Account, NormalizedEntry } from '../../types/index.js';
import { loadGoalNames } from '../../lib/savings-goals.js';

export interface Names {
  accounts: Map<number, string>;
  categories: Map<number, string>;
  tags: Map<number, string>;
}

/** Account, category and (optionally) tag names, for human-readable output. `accounts`: the accounts when the caller already read them. */
export async function loadNames(options: { tags?: boolean; accounts?: Account[] } = {}): Promise<Names> {
  const [accounts, categories, tags] = await Promise.all([
    options.accounts ?? fetchAccounts().then((response) => response.items),
    fetchCategories(),
    options.tags ? fetchTags() : Promise.resolve([]),
  ]);
  return {
    accounts: new Map(accounts.map((a) => [a.id, a.nome])),
    categories: new Map(categories.items.map((c) => [c.id, c.nome])),
    tags: new Map(tags.map((t) => [t.id, t.nome])),
  };
}

/** The name for an ID, or the ID itself when the name is unknown. */
export function nameOf(map: Map<number, string> | undefined, id: number): string | number {
  return map?.get(id) ?? id;
}

export function tagNames(names: Names, ids: number[]): string[] {
  return ids.map((id) => String(nameOf(names.tags, id)));
}

/** The savings goal names, read only when some entry carries a goal. */
export async function loadGoalNamesFor(entries: readonly NormalizedEntry[]): Promise<Map<number, string>> {
  return entries.some((entry) => entry.savingsGoalId != null) ? loadGoalNames() : new Map();
}

/** The entry with `savingsGoalName`: its goal's name, null without a goal or when the goal is gone. */
export function withGoalName<E extends NormalizedEntry>(entry: E, goals: Map<number, string>): E & { savingsGoalName: string | null } {
  const id = entry.savingsGoalId;
  return { ...entry, savingsGoalName: id == null ? null : goals.get(id) ?? null };
}
