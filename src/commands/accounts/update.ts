import chalk from 'chalk';
import { logger } from '../../utils/logger.js';
import { exitWithError } from '../../utils/action.js';
import { t } from '../../lib/i18n/index.js';
import { fetchAccounts, isCreditCard, updateAccount } from '../../lib/api.js';
import { invalidateNameCache } from '../../lib/config.js';
import type { UpdateAccountPayload } from '../../types/index.js';
import { resolveAccountType } from './create.js';
import { formatCurrency } from '../../utils/currency.js';
import { parseId } from '../../utils/parse.js';
import { liquidityFor, parseAccountForm, signedBalance } from './form.js';

interface UpdateAccountOptions {
  name?: string;
  type?: string;
  bank?: string;
  balance?: string;
  balanceDate?: string;
  debtor?: boolean;
  creditor?: boolean;
  liquidity?: string;
  currency?: string;
  hideNetWorth?: boolean;
  showNetWorth?: boolean;
  active?: boolean;
  inactive?: boolean;
  close?: boolean;
  json?: boolean;
}

const CHANGE_OPTIONS = [
  'name', 'type', 'bank', 'balance', 'balanceDate', 'debtor', 'creditor', 'liquidity',
  'currency', 'hideNetWorth', 'showNetWorth', 'active', 'inactive', 'close',
] as const;
const STATUS_OPTIONS: readonly string[] = ['active', 'inactive', 'close'];

export async function updateAccountAction(id: string, options: UpdateAccountOptions): Promise<void> {
  const accountId = parseId(id);
  if (accountId === undefined) {
    exitWithError(t('errorInvalidAccountId'));
  }

  if (CHANGE_OPTIONS.every((key) => options[key] === undefined)) {
    exitWithError(t('errorNoAccountChanges'));
  }

  if (options.active && options.inactive) {
    exitWithError(t('errorActiveInactiveTogether'));
  }
  if (options.close && !options.inactive) {
    exitWithError(t('errorCloseNeedsInactive'));
  }
  if (options.hideNetWorth && options.showNetWorth) {
    exitWithError(t('errorHideShowNetWorthTogether'));
  }
  const form = parseAccountForm(options);
  let moeda: number | undefined;
  if (options.currency !== undefined) {
    moeda = parseId(options.currency);
    if (moeda === undefined) {
      exitWithError(t('errorInvalidCurrency'));
    }
  }

  const response = await fetchAccounts();
  const existing = response.items.find((a) => a.id === accountId);
  if (!existing) {
    exitWithError(t('errorAccountNotFound', accountId));
  }

  let accountType = response.meta.tipos.find((t) => t.id === existing.tipoNovo);
  let liquidez = existing.liquidez;
  if (options.type !== undefined) {
    accountType = resolveAccountType(response.meta.tipos, options.type);
    if (!accountType) {
      exitWithError(t('errorUnknownAccountType', options.type));
    }
    // The web form keeps the current liquidez when the new type has none.
    liquidez = accountType.liquidez ?? liquidez;
  }
  // A card by its (new) type, or by the stored account when its type is not listed.
  const isCard = accountType ? !!accountType.grupobp : isCreditCard(existing);
  liquidez = liquidityFor(form, isCard, accountType?.nome ?? existing.tipo) ?? liquidez;

  let exibirBP = existing.exibirBP;
  if (options.hideNetWorth) exibirBP = false;
  if (options.showNetWorth) exibirBP = true;

  const { banco, encerrada, ...rest } = existing;
  const statusOnly = CHANGE_OPTIONS.every((key) => STATUS_OPTIONS.includes(key) || options[key] === undefined);
  const payload: UpdateAccountPayload = {
    ...rest,
    nome: options.name ?? existing.nome,
    tipoNovo: accountType?.id ?? existing.tipoNovo,
    liquidez,
    saldoInicial: signedBalance(form, existing.saldoInicial),
    dataSaldoInicial: form.balanceDate ?? existing.dataSaldoInicial,
    moeda: moeda ?? existing.moeda,
    exibirBP,
    // The web's status dialog passes banco through as read (its id when it is
    // an object); the account edit form sends 0 for no bank, the card form never does.
    banco: statusOnly
      ? (banco && typeof banco === 'object' ? banco.id : banco)
      : (options.bank ?? banco?.id ?? (isCard ? undefined : 0)),
  };
  // As the web's status dialog: closing sets encerrada, a real status change
  // leaves it undefined (absent from the JSON); otherwise it goes back as stored.
  if (options.close) {
    payload.status = false;
    payload.encerrada = true;
  } else if ((options.active && !existing.status) || (options.inactive && existing.status)) {
    payload.status = !!options.active;
  } else {
    payload.encerrada = encerrada;
  }

  const account = await updateAccount(accountId, payload);
  invalidateNameCache('accounts');

  if (options.json) {
    console.log(JSON.stringify(account, null, 2));
    return;
  }

  logger.success(t('accountUpdated', account.nome));
  console.log(`  ${chalk.gray(`${t('labelId')}:`)} ${account.id}`);
  console.log(`  ${chalk.gray(`${t('labelType')}:`)} ${account.tipo}`);
  if (account.banco) {
    console.log(`  ${chalk.gray(`${t('labelBank')}:`)} ${account.banco.nome}`);
  }
  console.log(`  ${chalk.gray(`${t('labelBalance')}:`)} ${formatCurrency(account.saldoInicial)}`);
  console.log(`  ${chalk.gray(`${t('statusActive')}:`)} ${account.status ? chalk.green(t('yes')) : chalk.gray(t('no'))}`);
}
