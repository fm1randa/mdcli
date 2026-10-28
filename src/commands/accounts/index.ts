import { Command } from 'commander';
import Table from 'cli-table3';
import { logger } from '../../utils/logger.js';
import { action } from '../../utils/action.js';
import { t } from '../../lib/i18n/index.js';
import { fetchAccounts } from '../../lib/api.js';
import { buildAliasCommand } from '../../lib/aliases.js';
import { createAccountAction } from './create.js';
import { deleteAccountAction } from './delete.js';
import { listAction } from './list.js';
import { updateAccountAction } from './update.js';

export const accountsCommand = new Command('accounts')
  .description(t('accountsManageDescription'));

accountsCommand
  .command('list')
  .description(t('accountsListDescription'))
  .option('--json', t('jsonOption'))
  .option('--active', t('activeOnlyOption'))
  .option('--at <date>', t('accountsListAtOption'))
  .action(action(listAction));

accountsCommand
  .command('types')
  .description(t('accountsTypesDescription'))
  .option('--json', t('jsonOption'))
  .action(action(async (options: { json?: boolean }) => {
    const response = await fetchAccounts();
    const types = response.meta.tipos;

    if (options.json) {
      console.log(JSON.stringify(types, null, 2));
      return;
    }

    const table = new Table({
      head: [t('accountTypeTableId'), t('accountTypeTableName')],
      style: { head: ['cyan'] },
    });
    for (const type of types) {
      table.push([type.id.toString(), type.nome]);
    }
    logger.header(t('accountsTypesHeader', types.length));
    console.log(table.toString());
  }));

accountsCommand
  .command('create')
  .description(t('accountsCreateDescription'))
  .requiredOption('-n, --name <name>', t('accountsCreateNameOption'))
  .requiredOption('-t, --type <type>', t('accountsCreateTypeOption'))
  .option('-b, --bank <bankId>', t('accountsCreateBankOption'))
  .option('--balance <value>', t('accountsCreateBalanceOption'))
  .option('--balance-date <date>', t('accountsCreateBalanceDateOption'))
  .option('--debtor', t('accountsCreateDebtorOption'))
  .option('--creditor', t('accountsCreateCreditorOption'))
  .option('--liquidity <value>', t('accountsCreateLiquidityOption'))
  .option('--currency <id>', t('accountsCreateCurrencyOption'))
  .option('--hide-net-worth', t('accountsCreateHideNetWorthOption'))
  .option('--json', t('jsonOption'))
  .action(action(createAccountAction));

accountsCommand
  .command('update <id>')
  .description(t('accountsUpdateDescription'))
  .option('-n, --name <name>', t('accountsUpdateNameOption'))
  .option('-t, --type <type>', t('accountsUpdateTypeOption'))
  .option('-b, --bank <bankId>', t('accountsUpdateBankOption'))
  .option('--balance <value>', t('accountsUpdateBalanceOption'))
  .option('--balance-date <date>', t('accountsUpdateBalanceDateOption'))
  .option('--debtor', t('accountsUpdateDebtorOption'))
  .option('--creditor', t('accountsUpdateCreditorOption'))
  .option('--liquidity <value>', t('accountsUpdateLiquidityOption'))
  .option('--currency <id>', t('accountsUpdateCurrencyOption'))
  .option('--hide-net-worth', t('accountsUpdateHideNetWorthOption'))
  .option('--show-net-worth', t('accountsUpdateShowNetWorthOption'))
  .option('--active', t('accountsUpdateActiveOption'))
  .option('--inactive', t('accountsUpdateInactiveOption'))
  .option('--close', t('accountsUpdateCloseOption'))
  .option('--json', t('jsonOption'))
  .action(action(updateAccountAction));

accountsCommand
  .command('delete <id>')
  .description(t('accountsDeleteDescription'))
  .option('--dangerously-skip-confirmation', t('skipConfirmationOption'))
  .option('--json', t('jsonOption'))
  .action(action(deleteAccountAction));

buildAliasCommand(accountsCommand, 'accounts');
