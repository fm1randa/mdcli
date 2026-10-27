import chalk from 'chalk';
import { logger } from '../../utils/logger.js';
import { exitWithError } from '../../utils/action.js';
import { t } from '../../lib/i18n/index.js';
import { fetchAccounts, createAccount } from '../../lib/api.js';
import { invalidateNameCache } from '../../lib/config.js';
import type { AccountMeta, CreateAccountPayload } from '../../types/index.js';
import { formatCurrency } from '../../utils/currency.js';
import { parseId } from '../../utils/parse.js';
import { defaultBalanceDate, liquidityFor, parseAccountForm, signedBalance } from './form.js';

function normalizeTypeName(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function resolveAccountType(
  types: AccountMeta['tipos'],
  input: string
): AccountMeta['tipos'][number] | undefined {
  const numId = parseId(input);
  if (numId !== undefined) {
    return types.find((t) => t.id === numId);
  }
  const normalized = normalizeTypeName(input);
  return types.find((t) => normalizeTypeName(t.nome) === normalized);
}

interface CreateAccountOptions {
  name: string;
  type: string;
  bank?: string;
  balance?: string;
  balanceDate?: string;
  debtor?: boolean;
  creditor?: boolean;
  liquidity?: string;
  currency?: string;
  hideNetWorth?: boolean;
  json?: boolean;
}

export async function createAccountAction(options: CreateAccountOptions): Promise<void> {
  const form = parseAccountForm(options);
  // A new account has no stored balance, so the sign is checked before any request.
  const saldoInicial = signedBalance(form, 0);
  const currency = options.currency !== undefined ? parseId(options.currency) : 1;
  if (currency === undefined) {
    exitWithError(t('errorInvalidCurrency'));
  }

  const response = await fetchAccounts();
  const accountType = resolveAccountType(response.meta.tipos, options.type);
  if (!accountType) {
    exitWithError(t('errorUnknownAccountType', options.type));
  }

  // The web form starts at 1 and takes the type's liquidez when the type has one.
  const liquidity = liquidityFor(form, !!accountType.grupobp, accountType.nome) ?? accountType.liquidez ?? 1;

  const payload: CreateAccountPayload = {
    nome: options.name,
    tipoNovo: accountType.id,
    saldoInicial,
    dataSaldoInicial: form.balanceDate ?? defaultBalanceDate(),
    exibirBP: !options.hideNetWorth,
    moeda: currency,
    liquidez: liquidity,
  };

  if (options.bank) {
    payload.banco = options.bank;
  }

  const account = await createAccount(payload);
  invalidateNameCache('accounts');

  if (options.json) {
    console.log(JSON.stringify(account, null, 2));
    return;
  }

  logger.success(t('accountCreated', account.nome));
  console.log(`  ${chalk.gray(`${t('labelId')}:`)} ${account.id}`);
  console.log(`  ${chalk.gray(`${t('labelType')}:`)} ${account.tipo}`);
  if (account.banco) {
    console.log(`  ${chalk.gray(`${t('labelBank')}:`)} ${account.banco.nome}`);
  }
  console.log(`  ${chalk.gray(`${t('labelBalance')}:`)} ${formatCurrency(account.saldoInicial)}`);
}
