import { exitWithError } from '../../utils/action.js';
import { fetchCategories } from '../../lib/api.js';
import { getAliases, resolveId } from '../../lib/aliases.js';
import { parseId } from '../../utils/parse.js';

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
  const id = await resolveId('categories', input);
  if (id === null) {
    exitWithError(`Unknown category: ${input}. See available categories with: mdcli categories list --active`);
  }

  const { items } = await fetchCategories();
  const category = items.find((c) => c.id === id);
  if (!category || category.status) return id;

  if (!isExplicitReference(input)) {
    const name = input.toLowerCase();
    const active = items.find((c) => c.status && c.nome.toLowerCase() === name);
    if (active) return active.id;
  }

  exitWithError(
    `Category "${category.nome}" (${category.id}) is inactive, so the web app hides it from new entries. ` +
      'Use an active category (see: mdcli categories list --active) or reactivate it in Meu Dinheiro.'
  );
}
