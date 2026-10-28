import { exitWithError } from '../../utils/action.js';
import { t } from '../../lib/i18n/index.js';
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

/** A resolved category: its ID, and the catalog entry when the catalog lists it. */
export interface ResolvedCategory {
  id: number;
  /** null: an ID the catalog does not list goes to the API as written, so its type is unknown. */
  category: Category | null;
}

/**
 * The category an entry is created or updated with, and the catalog entry when
 * the catalog lists it. The web app hides inactive categories from the entry
 * form, so they are refused here too: a name that also matches an active
 * category resolves to the active one, and an ID, an Alias or a name that only
 * matches inactive categories fails with a message that says so. Unknown IDs
 * still go to the API, as before.
 */
export async function resolveEntryCategory(input: string): Promise<ResolvedCategory> {
  const checked = await checkEntryCategory(input);
  if ('error' in checked) exitWithError(checked.error);
  return { id: checked.id, category: checked.category };
}

/** The category with `id` from the catalog, or null when the catalog does not list it. */
export async function findCategory(id: number, catalog: CategoryCatalog = categoryCatalog()): Promise<Category | null> {
  return (await catalog()).find((item) => item.id === id) ?? null;
}

/**
 * `resolveEntryCategory` without exiting: the id, or the message it would exit with.
 * `catalog` lets a caller checking several categories read the list once.
 */
export async function checkEntryCategory(
  input: string,
  catalog: CategoryCatalog = categoryCatalog(),
): Promise<{ id: number; category: Category | null } | { error: string }> {
  const id = await resolveId('categories', input);
  if (id === null) {
    return { error: t('errorUnknownCategoryForEntry', input) };
  }

  const items = await catalog();
  const category = items.find((c) => c.id === id);
  if (!category || category.status) return { id, category: category ?? null };

  if (!isExplicitReference(input)) {
    const active = items.find((c) => c.status && sameName(c.nome, input));
    if (active) return { id: active.id, category: active };
  }

  return { error: t('errorCategoryInactive', category.nome, category.id) };
}

/** How the entry-type messages name each type: `d` is "an expense". */
const TYPE_WORDS: Record<Category['tipo'], () => string> = {
  d: () => t('categoryTypeExpense'),
  r: () => t('categoryTypeIncome'),
  t: () => t('categoryTypeTransfer'),
};

/**
 * The refusal for a category of another type:
 * `Category "Alimentação" (10) is an expense, but the entry type is income. The
 * web app only offers categories …` The web app's picker lists only categories
 * of the entry's type (md.js, filterCats) and changing the type clears the
 * category (changeTipo), so a mismatched pair never reaches the API there.
 */
export function describeCategoryTypeMismatch(category: Category, tipo: Category['tipo']): string {
  return t(
    'errorCategoryEntryTypeMismatch',
    category.nome,
    category.id,
    TYPE_WORDS[category.tipo](),
    TYPE_WORDS[tipo]()
  );
}
