import { exitWithError } from '../../utils/action.js';
import { t } from '../../lib/i18n/index.js';
import { resolveIds } from '../../lib/aliases.js';

/** Tag IDs for a comma-separated list of Identifiers; exits naming the ones that match no Tag. */
export async function resolveTags(input: string): Promise<number[]> {
  const { ids, unresolved } = await resolveIds('tags', input);
  if (unresolved.length > 0) {
    exitWithError(t('errorUnknownTags', unresolved.join(', ')));
  }
  return ids;
}
