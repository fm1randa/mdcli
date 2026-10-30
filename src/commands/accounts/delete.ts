import chalk from 'chalk';
import { logger } from '../../utils/logger.js';
import { exitWithError } from '../../utils/action.js';
import { t } from '../../lib/i18n/index.js';
import { promptConfirmation } from '../../utils/prompt.js';
import { fetchAccounts, normalizeAccounts, deleteAccount } from '../../lib/api.js';
import { invalidateNameCache } from '../../lib/config.js';
import { parseId } from '../../utils/parse.js';


interface DeleteAccountOptions {
  dangerouslySkipConfirmation?: boolean;
  json?: boolean;
}

export async function deleteAccountAction(id: string, options: DeleteAccountOptions): Promise<void> {
  const accountId = parseId(id);
  if (accountId === undefined) {
    exitWithError(t('errorInvalidAccountId'));
  }

  if (!options.dangerouslySkipConfirmation) {
    const account = normalizeAccounts(await fetchAccounts()).find((a) => a.id === accountId);
    if (!account) {
      exitWithError(t('errorAccountNotFound', accountId));
    }

    const confirmed = await promptConfirmation(
      chalk.red(t('confirmDeleteAccount', account.name, accountId))
    );

    if (!confirmed) {
      logger.info(t('deletionCancelled'));
      // eslint-disable-next-line local/no-bare-process-exit
      process.exit(0);
    }
  }

  await deleteAccount(accountId);
  invalidateNameCache('accounts');

  if (options.json) {
    console.log(JSON.stringify({ deleted: true, id: accountId }, null, 2));
    return;
  }

  logger.success(t('accountDeleted', accountId));
}
