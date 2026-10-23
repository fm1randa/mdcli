import { resolveId } from '../lib/aliases.js';
import { exitWithError } from '../utils/action.js';

/** The Account ID an identifier (ID, alias, or exact name) names, or exit with the message every command uses. */
export async function resolveAccountOrExit(input: string): Promise<number> {
  const accountId = await resolveId('accounts', input);
  if (accountId === null) {
    exitWithError(`Unknown account: ${input}`);
  }
  return accountId;
}
