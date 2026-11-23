import { exitWithError } from '../utils/action.js';
import { t } from '../lib/i18n/index.js';
import { fetchAccountById, isCreditCard } from '../lib/api.js';
import { resolveAccountOrExit } from './account-id.js';
import type { Account } from '../types/index.js';

/** The credit card an -a value names, or exit with why it is not one. */
export async function resolveCardOrExit(input: string): Promise<Account> {
  const accountId = await resolveAccountOrExit(input);

  const account = await fetchAccountById(accountId);
  if (!account) {
    exitWithError(t('errorAccountNotFoundById', accountId));
  }

  if (!isCreditCard(account)) {
    exitWithError(t('errorNotCreditCard', accountId));
  }
  return account;
}
