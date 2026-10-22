import { Command } from 'commander';
import { action } from '../../utils/action.js';
import { listAction } from './list.js';
import { runAction } from './run.js';

export const syncCommand = new Command('sync')
  .description('List connections and request a Sync');

syncCommand
  .command('list')
  .description('List connections and the accounts linked to each one')
  .option('--json', 'Output as JSON')
  .action(action(listAction));

syncCommand
  .command('run')
  .description('Request a Sync for the Connection that contains an Account, or for every Connection')
  .argument('<account>', 'Account Identifier (id, alias, or exact name), or "all"')
  .option('--yes', 'Skip the confirmation prompt')
  .option('--json', 'Output as JSON (requires --yes)')
  .action(action(runAction));
