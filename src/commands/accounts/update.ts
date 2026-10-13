import chalk from 'chalk';
import { logger } from '../../utils/logger.js';
import { exitWithError } from '../../utils/action.js';
import { fetchAccounts, updateAccount } from '../../lib/api.js';
import { invalidateNameCache } from '../../lib/config.js';
import type { UpdateAccountPayload } from '../../types/index.js';
import { resolveAccountType } from './create.js';
import { formatCurrency } from './format.js';

interface UpdateAccountOptions {
  name?: string;
  type?: string;
  bank?: string;
  balance?: string;
  currency?: string;
  active?: boolean;
  inactive?: boolean;
  json?: boolean;
}

export async function updateAccountAction(id: string, options: UpdateAccountOptions): Promise<void> {
  const accountId = Number(id);
  if (Number.isNaN(accountId)) {
    exitWithError('Invalid account ID. Must be a number.');
  }

  if (
    options.name === undefined &&
    options.type === undefined &&
    options.bank === undefined &&
    options.balance === undefined &&
    options.currency === undefined &&
    !options.active &&
    !options.inactive
  ) {
    exitWithError(
      'No changes specified. Use --name, --type, --bank, --balance, --currency, --active or --inactive.'
    );
  }

  if (options.active && options.inactive) {
    exitWithError('Cannot use --active and --inactive together.');
  }

  const response = await fetchAccounts();
  const existing = response.items.find((a) => a.id === accountId);
  if (!existing) {
    exitWithError(`Account ${accountId} not found.`);
  }

  let tipoNovo = existing.tipoNovo;
  let liquidez = existing.liquidez;
  if (options.type !== undefined) {
    const accountType = resolveAccountType(response.meta.tipos, options.type);
    if (!accountType) {
      exitWithError(`Unknown account type "${options.type}". Run "mdcli accounts types" to see valid options.`);
    }
    tipoNovo = accountType.id;
    liquidez = accountType.liquidez;
  }

  let saldoInicial = existing.saldoInicial;
  if (options.balance !== undefined) {
    const balance = Number(options.balance);
    if (Number.isNaN(balance)) {
      exitWithError('Invalid balance. Must be a number.');
    }
    saldoInicial = balance;
  }

  let moeda = existing.moeda;
  if (options.currency !== undefined) {
    const currency = Number(options.currency);
    if (Number.isNaN(currency)) {
      exitWithError('Invalid currency. Must be a number.');
    }
    moeda = currency;
  }

  let status = existing.status;
  if (options.active) status = true;
  if (options.inactive) status = false;

  const { banco, ...rest } = existing;
  const payload: UpdateAccountPayload = {
    ...rest,
    nome: options.name ?? existing.nome,
    tipoNovo,
    liquidez,
    saldoInicial,
    moeda,
    status,
    banco: options.bank ?? banco?.id,
  };

  const account = await updateAccount(accountId, payload);
  invalidateNameCache('accounts');

  if (options.json) {
    console.log(JSON.stringify(account, null, 2));
    return;
  }

  logger.success(`Account "${account.nome}" updated successfully!`);
  console.log(`  ${chalk.gray('ID:')} ${account.id}`);
  console.log(`  ${chalk.gray('Type:')} ${account.tipo}`);
  if (account.banco) {
    console.log(`  ${chalk.gray('Bank:')} ${account.banco.nome}`);
  }
  console.log(`  ${chalk.gray('Balance:')} ${formatCurrency(account.saldoInicial)}`);
  console.log(`  ${chalk.gray('Active:')} ${account.status ? chalk.green('yes') : chalk.gray('no')}`);
}
