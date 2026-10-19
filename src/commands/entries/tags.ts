import { exitWithError } from '../../utils/action.js';
import { resolveIds } from '../../lib/aliases.js';

/** Tag IDs for a comma-separated list of Identifiers; exits naming the ones that match no Tag. */
export async function resolveTags(input: string): Promise<number[]> {
  const { ids, unresolved } = await resolveIds('tags', input);
  if (unresolved.length > 0) {
    exitWithError(`Unknown tag(s): ${unresolved.join(', ')}`);
  }
  return ids;
}
