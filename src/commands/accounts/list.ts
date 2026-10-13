import Table from 'cli-table3';
import chalk from 'chalk';
import { logger } from '../../utils/logger.js';
import { fetchAccounts, normalizeAccounts } from '../../lib/api.js';
import { formatCurrency, formatStatus } from './format.js';

export async function listAction(options: { json?: boolean; active?: boolean }): Promise<void> {
  const response = await fetchAccounts();
  let accounts = normalizeAccounts(response);

  if (options.active) {
    accounts = accounts.filter((a) => a.active && !a.closed);
  }

  if (options.json) {
    console.log(JSON.stringify(accounts, null, 2));
    return;
  }

  const table = new Table({
    head: ['ID', 'Name', 'Type', 'Bank', 'Balance', 'Status'],
    style: { head: ['cyan'] },
  });

  for (const acc of accounts) {
    table.push([
      acc.id.toString(),
      acc.name,
      acc.type,
      acc.bank ?? chalk.gray('-'),
      formatCurrency(acc.balance),
      formatStatus(acc.active, acc.closed),
    ]);
  }

  logger.header(`Accounts (${accounts.length})`);
  console.log(table.toString());
}
