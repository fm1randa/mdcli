import { Command } from 'commander';
import Table from 'cli-table3';
import chalk from 'chalk';
import * as readline from 'readline';
import { logger } from '../utils/logger.js';
import { fetchAccounts, normalizeAccounts, createAccount, updateAccount, deleteAccount } from '../lib/api.js';
import { addAlias, getAliases, removeAlias, updateAlias } from '../lib/aliases.js';
import { invalidateNameCache } from '../lib/config.js';
import type { AccountMeta, CreateAccountPayload, UpdateAccountPayload } from '../types/index.js';

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

function normalizeTypeName(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function resolveAccountType(
  types: AccountMeta['tipos'],
  input: string
): AccountMeta['tipos'][number] | undefined {
  const numId = Number(input);
  if (!Number.isNaN(numId)) {
    return types.find((t) => t.id === numId);
  }
  const normalized = normalizeTypeName(input);
  return types.find((t) => normalizeTypeName(t.nome) === normalized);
}

export const accountsCommand = new Command('accounts')
  .description('Manage accounts');

accountsCommand
  .command('list')
  .description('List all accounts')
  .option('--json', 'Output as JSON')
  .option('--active', 'Show only active accounts')
  .action(listAction);

accountsCommand
  .command('types')
  .description('List available account types (used with "accounts create --type")')
  .option('--json', 'Output as JSON')
  .action(async (options: { json?: boolean }) => {
    try {
      const response = await fetchAccounts();
      const types = response.meta.tipos;

      if (options.json) {
        console.log(JSON.stringify(types, null, 2));
        return;
      }

      const table = new Table({
        head: ['ID', 'Name'],
        style: { head: ['cyan'] },
      });
      for (const type of types) {
        table.push([type.id.toString(), type.nome]);
      }
      logger.header(`Account Types (${types.length})`);
      console.log(table.toString());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(message);
      process.exit(1);
    }
  });

interface CreateAccountOptions {
  name: string;
  type: string;
  bank?: string;
  balance?: string;
  currency?: string;
  hideNetWorth?: boolean;
  json?: boolean;
}

async function createAccountAction(options: CreateAccountOptions): Promise<void> {
  try {
    const response = await fetchAccounts();
    const accountType = resolveAccountType(response.meta.tipos, options.type);
    if (!accountType) {
      logger.error(`Unknown account type "${options.type}". Run "mdcli accounts types" to see valid options.`);
      process.exit(1);
    }

    const balance = options.balance !== undefined ? Number(options.balance) : 0;
    if (Number.isNaN(balance)) {
      logger.error('Invalid balance. Must be a number.');
      process.exit(1);
    }

    const currency = options.currency !== undefined ? Number(options.currency) : 1;
    if (Number.isNaN(currency)) {
      logger.error('Invalid currency. Must be a number.');
      process.exit(1);
    }

    const payload: CreateAccountPayload = {
      nome: options.name,
      tipoNovo: accountType.id,
      saldoInicial: balance,
      dataSaldoInicial: new Date().toISOString(),
      exibirBP: !options.hideNetWorth,
      moeda: currency,
    };

    if (accountType.liquidez !== undefined) {
      payload.liquidez = accountType.liquidez;
    }

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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(message);
    process.exit(1);
  }
}

accountsCommand
  .command('create')
  .description('Create a new account')
  .requiredOption('-n, --name <name>', 'Account name')
  .requiredOption('-t, --type <type>', 'Account type, ID or name (see "mdcli accounts types")')
  .option('-b, --bank <bankId>', 'Bank ID (as used by the Meu Dinheiro web UI)')
  .option('--balance <value>', 'Initial balance, defaults to 0')
  .option('--currency <id>', 'Currency ID, defaults to 1 (BRL)')
  .option('--hide-net-worth', 'Exclude this account from net worth calculations')
  .option('--json', 'Output as JSON')
  .action(createAccountAction);

function promptConfirmation(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

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

async function updateAccountAction(id: string, options: UpdateAccountOptions): Promise<void> {
  try {
    const accountId = Number(id);
    if (Number.isNaN(accountId)) {
      logger.error('Invalid account ID. Must be a number.');
      process.exit(1);
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
      logger.error(
        'No changes specified. Use --name, --type, --bank, --balance, --currency, --active or --inactive.'
      );
      process.exit(1);
    }

    if (options.active && options.inactive) {
      logger.error('Cannot use --active and --inactive together.');
      process.exit(1);
    }

    const response = await fetchAccounts();
    const existing = response.items.find((a) => a.id === accountId);
    if (!existing) {
      logger.error(`Account ${accountId} not found.`);
      process.exit(1);
    }

    let tipoNovo = existing.tipoNovo;
    let liquidez = existing.liquidez;
    if (options.type !== undefined) {
      const accountType = resolveAccountType(response.meta.tipos, options.type);
      if (!accountType) {
        logger.error(`Unknown account type "${options.type}". Run "mdcli accounts types" to see valid options.`);
        process.exit(1);
      }
      tipoNovo = accountType.id;
      liquidez = accountType.liquidez;
    }

    let saldoInicial = existing.saldoInicial;
    if (options.balance !== undefined) {
      const balance = Number(options.balance);
      if (Number.isNaN(balance)) {
        logger.error('Invalid balance. Must be a number.');
        process.exit(1);
      }
      saldoInicial = balance;
    }

    let moeda = existing.moeda;
    if (options.currency !== undefined) {
      const currency = Number(options.currency);
      if (Number.isNaN(currency)) {
        logger.error('Invalid currency. Must be a number.');
        process.exit(1);
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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(message);
    process.exit(1);
  }
}

accountsCommand
  .command('update <id>')
  .description('Update an account (only the fields you pass are changed)')
  .option('-n, --name <name>', 'New account name')
  .option('-t, --type <type>', 'New account type, ID or name (see "mdcli accounts types")')
  .option('-b, --bank <bankId>', 'New bank ID')
  .option('--balance <value>', 'New initial balance')
  .option('--currency <id>', 'New currency ID')
  .option('--active', 'Mark the account as active')
  .option('--inactive', 'Mark the account as inactive (archive)')
  .option('--json', 'Output as JSON')
  .action(updateAccountAction);

interface DeleteAccountOptions {
  dangerouslySkipConfirmation?: boolean;
  json?: boolean;
}

async function deleteAccountAction(id: string, options: DeleteAccountOptions): Promise<void> {
  try {
    const accountId = Number(id);
    if (Number.isNaN(accountId)) {
      logger.error('Invalid account ID. Must be a number.');
      process.exit(1);
    }

    if (!options.dangerouslySkipConfirmation) {
      const account = normalizeAccounts(await fetchAccounts()).find((a) => a.id === accountId);
      if (!account) {
        logger.error(`Account ${accountId} not found.`);
        process.exit(1);
      }

      const confirmed = await promptConfirmation(
        chalk.red(`Are you sure you want to delete account "${account.name}" (${accountId})? (y/N) `)
      );

      if (!confirmed) {
        logger.info('Deletion cancelled.');
        process.exit(0);
      }
    }

    await deleteAccount(accountId);
    invalidateNameCache('accounts');

    if (options.json) {
      console.log(JSON.stringify({ deleted: true, id: accountId }, null, 2));
      return;
    }

    logger.success(`Account ${accountId} deleted successfully!`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(message);
    process.exit(1);
  }
}

accountsCommand
  .command('delete <id>')
  .description('Delete an account')
  .option('--dangerously-skip-confirmation', 'Skip confirmation prompt')
  .option('--json', 'Output as JSON')
  .action(deleteAccountAction);

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
