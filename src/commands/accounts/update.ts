import chalk from 'chalk';
import { logger } from '../../utils/logger.js';
import { exitWithError } from '../../utils/action.js';
import { fetchAccounts, updateAccount } from '../../lib/api.js';
import { invalidateNameCache } from '../../lib/config.js';
import type { UpdateAccountPayload } from '../../types/index.js';
import { resolveAccountType } from './create.js';
import { formatCurrency } from '../../utils/currency.js';
import { parseId } from '../../utils/parse.js';
import { liquidityForType, parseAccountForm, signedBalance } from './form.js';

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

export async function updateAccountAction(id: string, options: UpdateAccountOptions): Promise<void> {
  const accountId = parseId(id);
  if (accountId === undefined) {
    exitWithError('Invalid account ID. Must be a number.');
  }

  if (CHANGE_OPTIONS.every((key) => options[key] === undefined)) {
    exitWithError(
      'No changes specified. Use --name, --type, --bank, --balance, --balance-date, --debtor, --creditor, ' +
        '--liquidity, --currency, --hide-net-worth, --show-net-worth, --active or --inactive.'
    );
  }

  if (options.active && options.inactive) {
    exitWithError('Cannot use --active and --inactive together.');
  }
  if (options.close && !options.inactive) {
    exitWithError('--close only works together with --inactive.');
  }
  if (options.hideNetWorth && options.showNetWorth) {
    exitWithError('Cannot use --hide-net-worth and --show-net-worth together.');
  }
  const form = parseAccountForm(options);
  let moeda: number | undefined;
  if (options.currency !== undefined) {
    moeda = parseId(options.currency);
    if (moeda === undefined) {
      exitWithError('Invalid currency. Must be a number.');
    }
  }

  const response = await fetchAccounts();
  const existing = response.items.find((a) => a.id === accountId);
  if (!existing) {
    exitWithError(`Account ${accountId} not found.`);
  }

  let accountType = response.meta.tipos.find((t) => t.id === existing.tipoNovo);
  let liquidez = existing.liquidez;
  if (options.type !== undefined) {
    accountType = resolveAccountType(response.meta.tipos, options.type);
    if (!accountType) {
      exitWithError(`Unknown account type "${options.type}". Run "mdcli accounts types" to see valid options.`);
    }
    // The web form keeps the current liquidez when the new type has none.
    liquidez = accountType.liquidez ?? liquidez;
  }
  liquidez = liquidityForType(form, accountType) ?? liquidez;

  let exibirBP = existing.exibirBP;
  if (options.hideNetWorth) exibirBP = false;
  if (options.showNetWorth) exibirBP = true;

  const { banco, encerrada, ...rest } = existing;
  const payload: UpdateAccountPayload = {
    ...rest,
    nome: options.name ?? existing.nome,
    tipoNovo: accountType?.id ?? existing.tipoNovo,
    liquidez,
    saldoInicial: signedBalance(form, existing.saldoInicial),
    dataSaldoInicial: form.balanceDate ?? existing.dataSaldoInicial,
    moeda: moeda ?? existing.moeda,
    exibirBP,
    // The web's edit form sends 0 for an account without a bank.
    banco: options.bank ?? banco?.id ?? 0,
  };
  // As the web's status dialog: closing sets encerrada, any other status
  // change leaves it undefined (absent from the JSON); the edit form keeps it.
  if (options.close) {
    payload.status = false;
    payload.encerrada = true;
  } else if (options.active || options.inactive) {
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

  logger.success(`Account "${account.nome}" updated successfully!`);
  console.log(`  ${chalk.gray('ID:')} ${account.id}`);
  console.log(`  ${chalk.gray('Type:')} ${account.tipo}`);
  if (account.banco) {
    console.log(`  ${chalk.gray('Bank:')} ${account.banco.nome}`);
  }
  console.log(`  ${chalk.gray('Balance:')} ${formatCurrency(account.saldoInicial)}`);
  console.log(`  ${chalk.gray('Active:')} ${account.status ? chalk.green('yes') : chalk.gray('no')}`);
}
