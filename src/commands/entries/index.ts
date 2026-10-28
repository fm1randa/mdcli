import { Command, Option } from 'commander';
import { action } from '../../utils/action.js';
import { t } from '../../lib/i18n/index.js';
import { createAction } from './create.js';
import { deleteAction } from './delete.js';
import { addFilterOptions } from './filters.js';
import { listAction, summaryAction } from './list.js';
import { scopeOption } from './series.js';
import { importCommand } from './import/index.js';
import { showAction } from './show.js';
import { updateAction } from './update.js';

export const entriesCommand = new Command('entries')
  .description(t('entriesManageDescription'));

addFilterOptions(entriesCommand.command('list').description(t('entriesListDescription')))
  .option('--json', t('jsonOption'))
  .option('--csv', t('entriesListCsvOption'))
  .action(action(listAction));

addFilterOptions(
  entriesCommand.command('summary').description(t('entriesSummaryDescription'))
)
  .option('-b, --by <grouping>', t('entriesSummaryByOption'), 'category')
  .option('--include-transfers', t('entriesSummaryIncludeTransfersOption'))
  .option('--json', t('jsonOption'))
  .option('--csv', t('csvOption'))
  .action(action(summaryAction));

entriesCommand
  .command('show <id>')
  .description(t('entriesShowDescription'))
  .option('--json', t('entriesShowJsonOption'))
  .option('--raw', t('entriesShowRawOption'))
  .action(action(showAction));

entriesCommand
  .command('create')
  .description(t('entriesCreateDescription'))
  .requiredOption('-a, --account <id>', t('entriesCreateAccountOption'))
  .requiredOption('-d, --description <text>', t('entriesCreateDescriptionOption'))
  .requiredOption('-v, --value <amount>', t('entriesCreateValueOption'))
  .option('-T, --type <type>', t('entriesCreateTypeOption'), 'expense')
  .option('--to-account <id>', t('entriesCreateToAccountOption'))
  .option('-c, --category <id>', t('entriesCreateCategoryOption'))
  .option('-D, --date <date>', t('entriesCreateDateOption'))
  .option('-g, --tags <ids>', t('entriesTagsOption'))
  .option('-n, --notes <text>', t('entriesNotesOption'))
  .option('-p, --pending', t('entriesCreatePendingOption'))
  .option('--confirmed', t('entriesCreateConfirmedOption'))
  .addOption(new Option('-S, --scheduled', t('entriesScheduledAliasOption')).hideHelp())
  .option('-r, --repeat <interval>', t('entriesCreateRepeatOption'))
  .option('--frequency <n>', t('entriesCreateFrequencyOption'))
  .option('--times <n>', t('entriesCreateTimesOption'))
  .option('-i, --installments <n>', t('entriesCreateInstallmentsOption'))
  .option('--first-installment <n>', t('entriesCreateFirstInstallmentOption'))
  .option('--per-installment', t('entriesCreatePerInstallmentOption'))
  .option('--invoice <YYYY-MM>', t('entriesCreateInvoiceOption'))
  .option('--json', t('jsonOption'))
  .action(action(createAction));

entriesCommand
  .command('update <id>')
  .description(t('entriesUpdateDescription'))
  .option('-a, --account <id>', t('entriesUpdateAccountOption'))
  .option('--to-account <id>', t('entriesUpdateToAccountOption'))
  .option('-d, --description <text>', t('entriesCreateDescriptionOption'))
  .option('-v, --value <amount>', t('entriesUpdateValueOption'))
  .option('-T, --type <type>', t('entriesUpdateTypeOption'))
  .option('-c, --category <id>', t('entriesUpdateCategoryOption'))
  .option('-D, --date <date>', t('entriesUpdateDateOption'))
  .option('-g, --tags <ids>', t('entriesTagsOption'))
  .option('-n, --notes <text>', t('entriesNotesOption'))
  .option('-p, --pending', t('entriesUpdatePendingOption'))
  .option('--confirmed', t('entriesUpdateConfirmedOption'))
  .option('-r, --reconciled', t('entriesUpdateReconciledOption'))
  .addOption(new Option('-S, --scheduled', t('entriesScheduledAliasOption')).hideHelp())
  .addOption(scopeOption(t('scopeVerbChange')))
  .option('--json', t('jsonOption'))
  .action(action(updateAction));

entriesCommand
  .command('delete <id>')
  .description(t('entriesDeleteDescription'))
  .addOption(scopeOption(t('scopeVerbDelete')))
  .option('--dangerously-skip-confirmation', t('entriesDeleteSkipConfirmationOption'))
  .option('--json', t('jsonOption'))
  .action(action(deleteAction));

entriesCommand.addCommand(importCommand);
