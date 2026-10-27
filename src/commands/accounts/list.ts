import Table from 'cli-table3';
import chalk from 'chalk';
import { logger } from '../../utils/logger.js';
import { exitWithError } from '../../utils/action.js';
import { fetchAccountBalances, fetchAccounts, normalizeAccounts } from '../../lib/api.js';
import { calendarDay, getCurrentMonthRange, isCalendarDate } from '../../lib/dates.js';
import type { AccountWithBalance } from '../../types/index.js';
import { formatStatus } from './format.js';
import { formatCurrency } from '../../utils/currency.js';
import { cell } from '../../utils/text.js';

export async function listAction(options: { json?: boolean; active?: boolean; at?: string }): Promise<void> {
  if (options.at !== undefined && !isCalendarDate(options.at)) {
    exitWithError(`Invalid date "${options.at}". Use YYYY-MM-DD (e.g., 2026-10-16).`);
  }
  // The web's panels default to the last day of the current month.
  const balanceDate = options.at ?? getCurrentMonthRange().endDate;

  const response = await fetchAccounts();
  const sums = await fetchAccountBalances(response.items, balanceDate);
  const byAccount = new Map(sums.map((s) => [s.conta, s]));

  let accounts: AccountWithBalance[] = normalizeAccounts(response).map((acc, i) => {
    const raw = response.items[i];
    const sum = byAccount.get(acc.id);
    return {
      ...acc,
      balance: sum?.confirmado ?? null,
      projectedBalance: sum?.projetado ?? null,
      balanceDate,
      bankBalance: raw.saldoUltimoExtrato ?? null,
      bankBalanceDate: calendarDay(raw.dataUltimoExtrato),
    };
  });

  if (options.active) {
    accounts = accounts.filter((a) => a.active && !a.closed);
  }

  if (options.json) {
    console.log(JSON.stringify(accounts, null, 2));
    return;
  }

  const table = new Table({
    head: ['ID', 'Name', 'Type', 'Bank', 'Confirmed', 'Projected', 'Bank statement', 'Status'],
    style: { head: ['cyan'] },
  });

  for (const acc of accounts) {
    table.push([
      acc.id.toString(),
      acc.name,
      acc.type,
      cell(acc.bank),
      cell(acc.balance, formatCurrency),
      cell(acc.projectedBalance, formatCurrency),
      cell(acc.bankBalance, (balance) => `${formatCurrency(balance)}${acc.bankBalanceDate ? chalk.gray(` (${acc.bankBalanceDate})`) : ''}`),
      formatStatus(acc.active, acc.closed),
    ]);
  }

  logger.header(`Accounts (${accounts.length}), balances at ${balanceDate}`);
  console.log(table.toString());
}
