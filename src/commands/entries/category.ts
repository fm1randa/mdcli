import { exitWithError } from '../../utils/action.js';
import { fetchCategories } from '../../lib/api.js';
import { getAliases, resolveId } from '../../lib/aliases.js';
import { sameName } from '../../lib/name-cache.js';
import type { Category } from '../../types/index.js';
import { parseId } from '../../utils/parse.js';

/** A reader of the Category catalog. */
export type CategoryCatalog = () => Promise<readonly Category[]>;

/** The Category catalog, fetched at most once per returned reader and only when asked for. */
export function categoryCatalog(): CategoryCatalog {
  let loaded: Promise<readonly Category[]> | null = null;
  return () => {
    loaded ??= fetchCategories().then((response) => response.items);
    return loaded;
  };
}

/** A bare number or an Alias points at one exact category; only a name can match several. */
function isExplicitReference(input: string): boolean {
  return parseId(input) !== undefined || getAliases('categories').some((a) => a.name === input);
}

/**
 * The category an entry is created or updated with. The web app hides
 * inactive categories from the entry form, so they are refused here too: a
 * name that also matches an active category resolves to the active one, and
 * an ID, an Alias or a name that only matches inactive categories fails with
 * a message that says so. Unknown IDs still go to the API, as before.
 */
export async function resolveEntryCategory(input: string): Promise<number> {
  const checked = await checkEntryCategory(input);
  if ('error' in checked) exitWithError(checked.error);
  return checked.id;
}

/**
 * `resolveEntryCategory` without exiting: the id, or the message it would exit with.
 * `catalog` lets a caller checking several categories read the list once.
 */
export async function checkEntryCategory(
  input: string,
  catalog: CategoryCatalog = categoryCatalog(),
): Promise<{ id: number } | { error: string }> {
  const id = await resolveId('categories', input);
  if (id === null) {
    return { error: `Unknown category: ${input}. See available categories with: mdcli categories list --active` };
  }

  const items = await catalog();
  const category = items.find((c) => c.id === id);
  if (!category || category.status) return { id };

  if (!isExplicitReference(input)) {
    const active = items.find((c) => c.status && sameName(c.nome, input));
    if (active) return { id: active.id };
  }

  return {
    error:
      `Category "${category.nome}" (${category.id}) is inactive, so the web app hides it from new entries. ` +
      'Use an active category (see: mdcli categories list --active) or reactivate it in Meu Dinheiro.',
  };
}
