import { Command } from 'commander';
import { action } from '../../utils/action.js';
import { listAction } from './list.js';

export const syncCommand = new Command('sync')
  .description('List connections');

syncCommand
  .command('list')
  .description('List connections and the accounts linked to each one')
  .option('--json', 'Output as JSON')
  .action(action(listAction));
