import { Command } from 'commander';
import Table from 'cli-table3';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { fetchAccounts, normalizeAccounts } from '../lib/api.js';

function formatCurrency(value: number): string {
  const formatted = value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
  return value >= 0 ? chalk.green(formatted) : chalk.red(formatted);
}

function formatStatus(active: boolean, closed: boolean): string {
  if (closed) return chalk.red('Closed');
  return active ? chalk.green('Active') : chalk.gray('Inactive');
}

async function listAction(options: { json?: boolean; active?: boolean }): Promise<void> {
  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(message);
    process.exit(1);
  }
}

export const accountsCommand = new Command('accounts')
  .description('Manage accounts');

accountsCommand
  .command('list')
  .description('List all accounts')
  .option('--json', 'Output as JSON')
  .option('--active', 'Show only active accounts')
  .action(listAction);
