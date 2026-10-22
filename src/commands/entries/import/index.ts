import { Command } from 'commander';
import { action } from '../../../utils/action.js';
import { listAction } from './list.js';
import { runAction } from './run.js';

export const importCommand = new Command('import')
  .description('List and import bank transactions from a bank connection');

importCommand
  .command('list')
  .description('List bank transactions for one account')
  .requiredOption('-a, --account <identifier>', 'Account ID, alias, or exact name (case-insensitive)')
  .option('--since <date>', 'First date to load (YYYY-MM-DD). Default: the later of the last statement date and 90 days ago')
  .option('--search-from <date>', 'Earliest candidate date (YYYY-MM-DD). Default: two days before the statement starts')
  .option('--search-to <date>', 'Latest candidate date (YYYY-MM-DD). Default: two days after the statement ends')
  .option('--json', 'Output as JSON')
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
  .option('--include-duplicates', 'Import --ids items flagged as duplicates instead of skipping them')
  .option('--since <date>', 'First date to load (YYYY-MM-DD). Default: the later of the last statement date and 90 days ago')
  .option('--search-from <date>', 'Earliest candidate date (YYYY-MM-DD). Default: two days before the statement starts')
  .option('--search-to <date>', 'Latest candidate date (YYYY-MM-DD). Default: two days after the statement ends')
  .option('--dry-run', 'Show what would be imported without writing anything')
  .option('--yes', 'Skip the confirmation prompt')
  .option('--json', 'Output as JSON (requires --yes or --dry-run)')
  .action(action(runAction));
