import chalk from 'chalk';
import { logger } from '../../utils/logger.js';
import { promptConfirmation } from '../../utils/prompt.js';
import { fetchEntry, deleteEntry } from '../../lib/api.js';
import { formatCurrency } from '../../utils/currency.js';
import { describeScope, resolveSeriesScope, type SeriesScope } from './series.js';
import { parseEntryId } from './entry-id.js';

interface DeleteOptions {
  dangerouslySkipConfirmation?: boolean;
  scope?: SeriesScope;
  json?: boolean;
}


export async function deleteAction(id: string, options: DeleteOptions): Promise<void> {
  const entryId = parseEntryId(id);

  const entry = await fetchEntry(entryId);
  const todos = resolveSeriesScope(entryId, entry, options.scope, {
    thisOnlyWarning: `Entry ${entryId} is an occurrence of a recurring series (${entry.parcela}): only this occurrence will be deleted. Use --scope following to delete this and the following occurrences, or --scope this to silence this warning.`,
  });

  if (!options.dangerouslySkipConfirmation) {
    console.log(chalk.yellow('\nEntry to be deleted:'));
    console.log(`  ${chalk.gray('ID:')} ${entry.id}`);
    console.log(`  ${chalk.gray('Description:')} ${entry.descricao}`);
    console.log(`  ${chalk.gray('Value:')} ${formatCurrency(entry.valor)}`);
    console.log(`  ${chalk.gray('Date:')} ${entry.data}`);
    if (todos !== undefined) {
      console.log(`  ${chalk.gray('Series:')} ${entry.parcela}`);
      console.log(`  ${chalk.gray('Scope:')} ${describeScope(todos)}`);
    }
    console.log();

    const question = todos
      ? 'Are you sure you want to delete this occurrence and all the following ones? (y/N) '
      : 'Are you sure you want to delete this entry? (y/N) ';
    const confirmed = await promptConfirmation(chalk.red(question));

    if (!confirmed) {
      logger.info('Deletion cancelled.');
      process.exit(0);
    }
  }

  await deleteEntry(entryId, todos);

  if (options.json) {
    const scope = todos === undefined ? {} : { scope: todos ? 'following' : 'this' };
    console.log(JSON.stringify({ deleted: true, id: entryId, ...scope }, null, 2));
    return;
  }

  logger.success(
    todos ? `Entry ${entryId} and the following occurrences deleted successfully!` : `Entry ${entryId} deleted successfully!`
  );
}
