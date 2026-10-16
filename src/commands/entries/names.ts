import { fetchAccounts, fetchCategories, fetchTags } from '../../lib/api.js';

export interface Names {
  accounts: Map<number, string>;
  categories: Map<number, string>;
  tags: Map<number, string>;
}

/** Account, category and (optionally) tag names, for human-readable output. */
export async function loadNames(options: { tags?: boolean } = {}): Promise<Names> {
  const [accounts, categories, tags] = await Promise.all([
    fetchAccounts(),
    fetchCategories(),
    options.tags ? fetchTags() : Promise.resolve([]),
  ]);
  return {
    accounts: new Map(accounts.items.map((a) => [a.id, a.nome])),
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
