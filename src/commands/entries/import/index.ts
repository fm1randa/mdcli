import { Command } from 'commander';
import { action } from '../../../utils/action.js';
import { listAction } from './list.js';
import { runAction } from './run.js';

const SINCE_HELP =
  'Load the full statement from this date (YYYY-MM-DD, at most 90 days ago), already imported or not. ' +
  'Default: the new bank transactions the connection reports; without them, the statement since the ' +
  'account\'s last statement date (or 90 days ago, if that is earlier), like the web import button';

const SEARCH_FROM_HELP = 'Earliest candidate date (YYYY-MM-DD). Default: two days before the statement starts';
const SEARCH_TO_HELP = 'Latest candidate date (YYYY-MM-DD). Default: two days after the statement ends';

const IMPORT_NOTES = `
Without --since, the new bank transactions the connection reports (its summary, the web's import
badge) are loaded. A connection read without a sync rarely has a summary; without one, the statement
loads from the web import dialog's default date: the account's last statement date, or 90 days ago
if that is earlier or missing. --since loads the statement from another date.

Each bank transaction is linked to at most one existing entry (conciliateWith), as the web does:
same value; an entry on the bank date first, then the day before, the day after, 2 days before,
2 days after; the same document number first. Reconciled entries are not listed as candidates and are
linked only on the same day, but --plan ("entry") and --edit (conciliate <prefix> <entryId>)
may still name one. On a credit card the candidates are the whole invoice of its next due date
(proximoVencimento), with no date window; a card without one cannot be imported.

AI suggestions come from the server and may differ between runs; pin the category with
--category, --plan or --edit.`;

export const importCommand = new Command('import')
  .description('List and import bank transactions from a bank connection');

importCommand
  .command('list')
  .description('List bank transactions for one account')
  .requiredOption('-a, --account <identifier>', 'Account ID, alias, or exact name (case-insensitive)')
  .option('--since <date>', SINCE_HELP)
  .option('--search-from <date>', SEARCH_FROM_HELP)
  .option('--search-to <date>', SEARCH_TO_HELP)
  .option('--json', 'Output as JSON')
  .addHelpText('after', IMPORT_NOTES)
  .action(action(listAction));

importCommand
  .command('run')
  .description('Import selected bank transactions for one account (asks y/N before writing)')
  .requiredOption('-a, --account <identifier>', 'Account ID, alias, or exact name (case-insensitive)')
  .option('--ids <prefixes>', 'Comma-separated integrationId prefixes to import with --category')
  .option('-c, --category <identifier>', 'Category ID, alias, or exact name for every --ids item')
  .option('--reject <prefixes>', 'Comma-separated integrationId prefixes to mark as not imported')
  .option('--plan <file>', 'JSON file with one action per bank transaction (import, conciliate, reject, skip)')
  .option('--edit', 'Choose the action, category, and description of each bank transaction in $EDITOR')
  .option('--include-duplicates', 'Import duplicates instead of skipping them (--ids; --edit opens them as import)')
  .option('--since <date>', SINCE_HELP)
  .option('--search-from <date>', SEARCH_FROM_HELP)
  .option('--search-to <date>', SEARCH_TO_HELP)
  .option('--dry-run', 'Show what would be imported without writing anything')
  .option('--yes', 'Skip the confirmation prompt')
  .option('--json', 'Output as JSON (requires --yes or --dry-run)')
  .addHelpText('after', IMPORT_NOTES)
  .action(action(runAction));
