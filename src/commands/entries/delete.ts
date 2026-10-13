import chalk from 'chalk';
import * as readline from 'readline';
import { logger } from '../../utils/logger.js';
import { exitWithError } from '../../utils/action.js';
import { fetchEntry, deleteEntry } from '../../lib/api.js';
import { formatCurrency } from './format.js';

interface DeleteOptions {
  dangerouslySkipConfirmation?: boolean;
  json?: boolean;
}

async function promptConfirmation(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

export async function deleteAction(id: string, options: DeleteOptions): Promise<void> {
  const entryId = Number(id);
  if (Number.isNaN(entryId)) {
    exitWithError('Invalid entry ID. Must be a number.');
  }

  const entry = await fetchEntry(entryId);

  if (!options.dangerouslySkipConfirmation) {
    console.log(chalk.yellow('\nEntry to be deleted:'));
    console.log(`  ${chalk.gray('ID:')} ${entry.id}`);
    console.log(`  ${chalk.gray('Description:')} ${entry.descricao}`);
    console.log(`  ${chalk.gray('Value:')} ${formatCurrency(entry.valor)}`);
    console.log(`  ${chalk.gray('Date:')} ${entry.data}`);
    console.log();

    const confirmed = await promptConfirmation(chalk.red('Are you sure you want to delete this entry? (y/N) '));

    if (!confirmed) {
      logger.info('Deletion cancelled.');
      process.exit(0);
    }
  }

  await deleteEntry(entryId);

  if (options.json) {
    console.log(JSON.stringify({ deleted: true, id: entryId }, null, 2));
    return;
  }

  logger.success(`Entry ${entryId} deleted successfully!`);
}
