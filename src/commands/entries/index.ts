import { Command } from 'commander';
import { action } from '../../utils/action.js';
import { createAction } from './create.js';
import { deleteAction } from './delete.js';
import { addFilterOptions } from './filters.js';
import { listAction, summaryAction } from './list.js';
import { scopeOption } from './series.js';
import { updateAction } from './update.js';

export const entriesCommand = new Command('entries')
  .description('Manage entries (lancamentos)');

addFilterOptions(entriesCommand.command('list').description('List entries for one or more accounts'))
  .option('--json', 'Output as JSON')
  .option('--csv', 'Output as CSV (with account and category names)')
  .action(action(listAction));

addFilterOptions(
  entriesCommand.command('summary').description('Total income and expenses grouped by category, month, or account')
)
  .option('-b, --by <grouping>', 'Group by: category, month, or account', 'category')
  .option('--include-transfers', 'Count transfers between accounts (left out by default)')
  .option('--json', 'Output as JSON')
  .option('--csv', 'Output as CSV')
  .action(action(summaryAction));

entriesCommand
  .command('create')
  .description('Create a new entry')
  .requiredOption('-a, --account <id>', 'Account ID, alias, or exact name (case-insensitive); for a transfer, the origin account')
  .requiredOption('-d, --description <text>', 'Entry description')
  .requiredOption('-v, --value <amount>', 'Entry value (positive number); with --installments, the total unless --per-installment')
  .option('-T, --type <type>', 'Entry type: expense, income, transfer (default: expense)', 'expense')
  .option('--to-account <id>', 'Transfers: destination account ID, alias, or exact name (required with -T transfer)')
  .option('-c, --category <id>', 'Category ID, alias, or exact name (case-insensitive) (required; transfers default to the transfer category)')
  .option('-D, --date <date>', 'Entry date (YYYY-MM-DD), defaults to today; with --installments, the first installment')
  .option('-g, --tags <ids>', 'Tag ID(s), alias(es), or exact name(s) (case-insensitive), comma-separated')
  .option('-n, --notes <text>', 'Additional notes/observations')
  .option('-p, --pending', 'Create as pending (confirmed, not reconciled)')
  .option('-S, --scheduled', 'Create as scheduled (not confirmed, no effective date), like turning Confirmado off in the web app')
  .option('-r, --repeat <interval>', 'Recurrence: daily, weekly, monthly, yearly (or d, w, m, y); with --installments, the spacing (default: monthly)')
  .option('--frequency <n>', 'Repeat every N intervals, e.g. --frequency 2 = every 2 months (default: 1)')
  .option('--times <n>', 'Fixed series: total occurrences, e.g. --times 6 = 6 times then stop (default: infinite)')
  .option('-i, --installments <n>', 'Installment series (parcelada): split --value into N installments (N >= 2)')
  .option('--first-installment <n>', 'Installments: number of the first installment, as in the web app (default: 1)')
  .option('--per-installment', 'Installments: --value is each installment, not the total')
  .option('--invoice <YYYY-MM>', 'Credit cards: invoice month to post to (default: the invoice the date falls in)')
  .option('--json', 'Output as JSON')
  .action(action(createAction));

entriesCommand
  .command('update <id>')
  .description('Update an existing entry (partial update - only send fields you want to change)')
  .option('-d, --description <text>', 'Entry description')
  .option('-v, --value <amount>', 'Entry value')
  .option('-T, --type <type>', 'Entry type: expense, income, transfer')
  .option('-c, --category <id>', 'Category ID, alias, or exact name (case-insensitive)')
  .option('-D, --date <date>', 'Entry date (YYYY-MM-DD)')
  .option('-g, --tags <ids>', 'Tag ID(s), alias(es), or exact name(s) (case-insensitive), comma-separated')
  .option('-n, --notes <text>', 'Additional notes/observations')
  .option('-p, --pending', 'Set as pending: confirmed, not reconciled (confirms a scheduled entry)')
  .option('-r, --reconciled', 'Set as reconciled')
  .option('-S, --scheduled', 'Set as scheduled: not confirmed, clears the effective date and value')
  .addOption(scopeOption('change'))
  .option('--json', 'Output as JSON')
  .action(action(updateAction));

entriesCommand
  .command('delete <id>')
  .description('Delete an entry')
  .addOption(scopeOption('delete'))
  .option('--dangerously-skip-confirmation', 'Skip confirmation prompt')
  .option('--json', 'Output as JSON')
  .action(action(deleteAction));
