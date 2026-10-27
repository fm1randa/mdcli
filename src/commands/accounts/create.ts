import chalk from 'chalk';
import { logger } from '../../utils/logger.js';
import { exitWithError } from '../../utils/action.js';
import { fetchAccounts, createAccount } from '../../lib/api.js';
import { invalidateNameCache } from '../../lib/config.js';
import type { AccountMeta, CreateAccountPayload } from '../../types/index.js';
import { formatCurrency } from '../../utils/currency.js';
import { parseId } from '../../utils/parse.js';
import { defaultBalanceDate, liquidityForType, parseAccountForm, signedBalance } from './form.js';

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
  const currency = options.currency !== undefined ? parseId(options.currency) : 1;
  if (currency === undefined) {
    exitWithError('Invalid currency. Must be a number.');
  }

  const response = await fetchAccounts();
  const accountType = resolveAccountType(response.meta.tipos, options.type);
  if (!accountType) {
    exitWithError(`Unknown account type "${options.type}". Run "mdcli accounts types" to see valid options.`);
  }

  // The web form starts at 1 and takes the type's liquidez when the type has one.
  const liquidity = liquidityForType(form, accountType) ?? accountType.liquidez ?? 1;

  const payload: CreateAccountPayload = {
    nome: options.name,
    tipoNovo: accountType.id,
    saldoInicial: signedBalance(form, 0),
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

  logger.success(`Account "${account.nome}" created successfully!`);
  console.log(`  ${chalk.gray('ID:')} ${account.id}`);
  console.log(`  ${chalk.gray('Type:')} ${account.tipo}`);
  if (account.banco) {
    console.log(`  ${chalk.gray('Bank:')} ${account.banco.nome}`);
  }
  console.log(`  ${chalk.gray('Balance:')} ${formatCurrency(account.saldoInicial)}`);
}
