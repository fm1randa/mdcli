import chalk from 'chalk';
import { logger } from '../../utils/logger.js';
import { t } from '../../lib/i18n/index.js';
import { promptConfirmation } from '../../utils/prompt.js';
import { fetchEntry, deleteEntry } from '../../lib/api.js';
import { flushStdout } from '../../utils/action.js';
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
    thisOnlyWarning: t('warningSeriesThisOnlyDelete', entryId, String(entry.parcela)),
    detachedOccurrence: t('errorDetachedSeriesDelete', entryId, String(entry.parcela)),
  });

  if (!options.dangerouslySkipConfirmation) {
    console.log(chalk.yellow(`\n${t('entriesDeleteHeader')}`));
    console.log(`  ${chalk.gray(`${t('labelId')}:`)} ${entry.id}`);
    console.log(`  ${chalk.gray(`${t('labelDescription')}:`)} ${entry.descricao}`);
    console.log(`  ${chalk.gray(`${t('labelValue')}:`)} ${formatCurrency(entry.valor)}`);
    console.log(`  ${chalk.gray(`${t('labelDate')}:`)} ${entry.data}`);
    if (todos !== undefined) {
      console.log(`  ${chalk.gray(`${t('labelSeries')}:`)} ${entry.parcela}`);
      console.log(`  ${chalk.gray(`${t('labelScope')}:`)} ${describeScope(todos)}`);
    }
    console.log();

    const question = todos ? t('confirmDeleteSeriesEntry') : t('confirmDeleteEntry');
    const confirmed = await promptConfirmation(chalk.red(question));

    if (!confirmed) {
      logger.info(t('deletionCancelled'));
      await flushStdout(3000);
      // eslint-disable-next-line local/no-bare-process-exit
      process.exit(0);
    }
  }

  await deleteEntry(entryId, todos);

  if (options.json) {
    const scope = todos === undefined ? {} : { scope: todos ? 'following' : 'this' };
    console.log(JSON.stringify({ deleted: true, id: entryId, ...scope }, null, 2));
    return;
  }

  logger.success(todos ? t('entryAndFollowingDeleted', entryId) : t('entryDeleted', entryId));
}
