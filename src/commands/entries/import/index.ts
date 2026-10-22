import { Command } from 'commander';
import { action } from '../../../utils/action.js';
import { listAction } from './list.js';

export const importCommand = new Command('import')
  .description('List bank transactions from a bank connection');

importCommand
  .command('list')
  .description('List bank transactions for one account')
  .requiredOption('-a, --account <identifier>', 'Account ID, alias, or exact name (case-insensitive)')
  .option('--since <date>', 'First date to load (YYYY-MM-DD). Default: the later of the last statement date and 90 days ago')
  .option('--search-from <date>', 'Earliest candidate date (YYYY-MM-DD). Default: two days before the statement starts')
  .option('--search-to <date>', 'Latest candidate date (YYYY-MM-DD). Default: two days after the statement ends')
  .option('--json', 'Output as JSON')
  .action(action(listAction));
