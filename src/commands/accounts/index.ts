import { Command } from 'commander';
import Table from 'cli-table3';
import { logger } from '../../utils/logger.js';
import { action } from '../../utils/action.js';
import { fetchAccounts } from '../../lib/api.js';
import { buildAliasCommand } from '../../lib/aliases.js';
import { createAccountAction } from './create.js';
import { deleteAccountAction } from './delete.js';
import { listAction } from './list.js';
import { updateAccountAction } from './update.js';

export const accountsCommand = new Command('accounts')
  .description('Manage accounts');

accountsCommand
  .command('list')
  .description('List all accounts with their balances (confirmed and projected, as in the web)')
  .option('--json', 'Output as JSON')
  .option('--active', 'Show only active accounts')
  .option('--at <date>', 'Balances at the end of this day (YYYY-MM-DD), defaults to the last day of the current month, like the web')
  .action(action(listAction));

accountsCommand
  .command('types')
  .description('List available account types (used with "accounts create --type")')
  .option('--json', 'Output as JSON')
  .action(action(async (options: { json?: boolean }) => {
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
  }));

accountsCommand
  .command('create')
  .description('Create a new account')
  .requiredOption('-n, --name <name>', 'Account name')
  .requiredOption('-t, --type <type>', 'Account type, ID or name (see "mdcli accounts types")')
  .option('-b, --bank <bankId>', 'Bank ID (as used by the Meu Dinheiro web UI)')
  .option('--balance <value>', 'Initial balance, defaults to 0 (negative means debtor)')
  .option('--balance-date <date>', 'Date of the initial balance (YYYY-MM-DD), defaults to yesterday, like the web')
  .option('--debtor', 'The initial balance is owed (Devedor): saved as negative')
  .option('--creditor', 'The initial balance is held (Credor): saved as positive, the default')
  .option('--liquidity <value>', '"Considerar saldo": available (1), future (2) or fixed (0); defaults to the type\'s, else available')
  .option('--currency <id>', 'Currency ID, defaults to 1 (BRL)')
  .option('--hide-net-worth', 'Exclude this account from net worth calculations')
  .option('--json', 'Output as JSON')
  .action(action(createAccountAction));

accountsCommand
  .command('update <id>')
  .description('Update an account (only the fields you pass are changed)')
  .option('-n, --name <name>', 'New account name')
  .option('-t, --type <type>', 'New account type, ID or name (see "mdcli accounts types")')
  .option('-b, --bank <bankId>', 'New bank ID')
  .option('--balance <value>', 'New initial balance (keeps the current sign unless negative or --debtor/--creditor)')
  .option('--balance-date <date>', 'New date of the initial balance (YYYY-MM-DD)')
  .option('--debtor', 'Make the initial balance owed (Devedor): saved as negative')
  .option('--creditor', 'Make the initial balance held (Credor): saved as positive')
  .option('--liquidity <value>', '"Considerar saldo": available (1), future (2) or fixed (0)')
  .option('--currency <id>', 'New currency ID')
  .option('--hide-net-worth', 'Exclude this account from net worth calculations')
  .option('--show-net-worth', 'Include this account in net worth calculations')
  .option('--active', 'Mark the account as active')
  .option('--inactive', 'Mark the account as inactive (archive)')
  .option('--close', 'With --inactive, also close the account (encerrada)')
  .option('--json', 'Output as JSON')
  .action(action(updateAccountAction));

accountsCommand
  .command('delete <id>')
  .description('Delete an account')
  .option('--dangerously-skip-confirmation', 'Skip confirmation prompt')
  .option('--json', 'Output as JSON')
  .action(action(deleteAccountAction));

buildAliasCommand(accountsCommand, 'accounts');
