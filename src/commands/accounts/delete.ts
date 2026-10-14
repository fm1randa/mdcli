import chalk from 'chalk';
import { logger } from '../../utils/logger.js';
import { exitWithError } from '../../utils/action.js';
import { promptConfirmation } from '../../utils/prompt.js';
import { fetchAccounts, normalizeAccounts, deleteAccount } from '../../lib/api.js';
import { invalidateNameCache } from '../../lib/config.js';


interface DeleteAccountOptions {
  dangerouslySkipConfirmation?: boolean;
  json?: boolean;
}

export async function deleteAccountAction(id: string, options: DeleteAccountOptions): Promise<void> {
  const accountId = Number(id);
  if (Number.isNaN(accountId)) {
    exitWithError('Invalid account ID. Must be a number.');
  }

  if (!options.dangerouslySkipConfirmation) {
    const account = normalizeAccounts(await fetchAccounts()).find((a) => a.id === accountId);
    if (!account) {
      exitWithError(`Account ${accountId} not found.`);
    }

    const confirmed = await promptConfirmation(
      chalk.red(`Are you sure you want to delete account "${account.name}" (${accountId})? (y/N) `)
    );

    if (!confirmed) {
      logger.info('Deletion cancelled.');
      process.exit(0);
    }
  }

  await deleteAccount(accountId);
  invalidateNameCache('accounts');

  if (options.json) {
    console.log(JSON.stringify({ deleted: true, id: accountId }, null, 2));
    return;
  }

  logger.success(`Account ${accountId} deleted successfully!`);
}
