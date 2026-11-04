import { getAliases } from './aliases.js';
import { sameName } from './name-cache.js';
import type { Category } from '../types/index.js';
import { parseId } from '../utils/parse.js';

/** A bare number or an Alias points at one exact category; only a name can match several. */
function isExplicitCategoryReference(input: string): boolean {
  return parseId(input) !== undefined || getAliases('categories').some((alias) => alias.name === input);
}

/**
 * The outcome of resolving a category reference. `unlisted` and `unresolved`
 * are the caller's call: entries send an ID the catalog does not list to the
 * API as written, while categories refuse it.
 */
export type CategoryReference =
  | { kind: 'resolved'; id: number; category: Category }
  | { kind: 'unlisted'; id: number }
  | { kind: 'unresolved' }
  | { kind: 'ambiguous'; ids: number[] }
  | { kind: 'inactive'; category: Category };

/**
 * The category `input` names, following the web app: a name that also matches an
 * active category resolves to the active one, a name matching several active
 * categories is ambiguous, and an inactive category is refused. An explicit
 * reference (a number or an Alias) is never swapped for a same-named active one.
 */
export function resolveCategoryReference(
  input: string,
  id: number | null,
  categories: readonly Category[],
): CategoryReference {
  if (id === null) return { kind: 'unresolved' };

  if (!isExplicitCategoryReference(input)) {
    const active = categories.filter((category) => category.status && sameName(category.nome, input));
    if (active.length > 1) return { kind: 'ambiguous', ids: active.map((category) => category.id) };
    if (active.length === 1) return { kind: 'resolved', id: active[0].id, category: active[0] };
  }

  const category = categories.find((item) => item.id === id);
  if (!category) return { kind: 'unlisted', id };
  if (!category.status) return { kind: 'inactive', category };
  return { kind: 'resolved', id, category };
}
