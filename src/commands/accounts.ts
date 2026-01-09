import { Command } from 'commander';
import Table from 'cli-table3';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { fetchAccounts, normalizeAccounts } from '../lib/api.js';
import { addAlias, getAliases, removeAlias, updateAlias } from '../lib/aliases.js';

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

const aliasCommand = accountsCommand
  .command('alias')
  .description('Manage account aliases');

aliasCommand
  .command('add')
  .description('Add an alias for an account')
  .requiredOption('--id <id>', 'Account ID')
  .requiredOption('--name <name>', 'Alias name')
  .action((options: { id: string; name: string }) => {
    const id = Number(options.id);
    if (Number.isNaN(id)) {
      logger.error('Invalid ID. Must be a number.');
      process.exit(1);
    }
    const result = addAlias('accounts', id, options.name);
    if (result.success) {
      logger.success(`Alias "${options.name}" added for account ${id}`);
    } else {
      logger.error(result.error ?? 'Failed to add alias');
      process.exit(1);
    }
  });

aliasCommand
  .command('list')
  .description('List all account aliases')
  .option('--json', 'Output as JSON')
  .action((options: { json?: boolean }) => {
    const aliases = getAliases('accounts');
    if (options.json) {
      console.log(JSON.stringify(aliases, null, 2));
      return;
    }
    if (aliases.length === 0) {
      logger.info('No aliases defined');
      return;
    }
    const table = new Table({
      head: ['ID', 'Alias'],
      style: { head: ['cyan'] },
    });
    for (const alias of aliases) {
      table.push([alias.id.toString(), alias.name]);
    }
    logger.header(`Account Aliases (${aliases.length})`);
    console.log(table.toString());
  });

aliasCommand
  .command('rm')
  .description('Remove an account alias')
  .option('--id <id>', 'Account ID')
  .option('--name <name>', 'Alias name')
  .action((options: { id?: string; name?: string }) => {
    const identifier = options.id ?? options.name;
    if (!identifier) {
      logger.error('Either --id or --name is required');
      process.exit(1);
    }
    const result = removeAlias('accounts', identifier);
    if (result.success) {
      logger.success(`Alias removed`);
    } else {
      logger.error(result.error ?? 'Failed to remove alias');
      process.exit(1);
    }
  });

aliasCommand
  .command('update')
  .description('Update an account alias')
  .requiredOption('--id <id>', 'Account ID')
  .requiredOption('--name <name>', 'New alias name')
  .action((options: { id: string; name: string }) => {
    const id = Number(options.id);
    if (Number.isNaN(id)) {
      logger.error('Invalid ID. Must be a number.');
      process.exit(1);
    }
    const result = updateAlias('accounts', id, options.name);
    if (result.success) {
      logger.success(`Alias updated to "${options.name}" for account ${id}`);
    } else {
      logger.error(result.error ?? 'Failed to update alias');
      process.exit(1);
    }
  });
