import Table from 'cli-table3';
import chalk from 'chalk';
import type { Category } from '../../../types/index.js';
import { formatCurrency } from '../../../utils/currency.js';
import { logger } from '../../../utils/logger.js';
import { cell } from '../../../utils/text.js';
import type { RunDocument } from './plan.js';

/** The summary of a run: statement, counts, and each item by action. */
export function printRun(run: RunDocument, context: { accountName: string | null; categories: readonly Category[] }): void {
  const name = context.accountName ?? String(run.accountId);
  logger.header(`${run.dryRun ? 'Import dry run' : 'Import'} for ${name} (connection account ${run.connectionAccount})`);
  const { start, end, balance } = run.statement;
  console.log(
    `Statement ${start ?? '-'} to ${end ?? '-'}, balance ${balance === null ? '-' : formatCurrency(balance)}`,
  );
  console.log(
    `Import ${run.imported.length}, conciliate ${run.conciliated.length}, ` +
      `reject ${run.rejected.length}, skip ${run.skipped.length}.`,
  );

  if (run.imported.length > 0) {
    const table = new Table({
      head: ['Prefix', 'Date', 'Value', 'Description', 'Category', 'Tags', 'Status'],
      style: { head: ['cyan'] },
    });
    for (const item of run.imported) {
      table.push([
        item.prefix,
        item.date,
        formatCurrency(item.value),
        cell(item.description),
        context.categories.find((category) => category.id === item.categoryId)?.nome ?? String(item.categoryId),
        item.tagIds.length === 0 ? chalk.gray('-') : item.tagIds.join(', '),
        item.status === 'reconciled' ? 'Reconciled' : 'Scheduled',
      ]);
    }
    logger.header('New entries');
    console.log(table.toString());
  }

  if (run.conciliated.length > 0) {
    const table = new Table({
      head: ['Prefix', 'Entry', 'Value before', 'Value after', 'Description before', 'Description after'],
      style: { head: ['cyan'] },
    });
    for (const item of run.conciliated) {
      table.push([
        item.prefix,
        String(item.entryId),
        formatCurrency(item.before.value),
        formatCurrency(item.after.value),
        cell(item.before.description),
        cell(item.after.description),
      ]);
    }
    logger.header('Linked entries');
    console.log(table.toString());
    logger.info('Linked entries keep their value and description (web default; overwrite preferences are not read).');
  }

  if (run.rejected.length > 0) {
    logger.header('Rejected');
    for (const item of run.rejected) console.log(`  ${item.prefix}`);
  }
  if (run.skipped.length > 0) {
    logger.header('Skipped');
    for (const item of run.skipped) console.log(`  ${item.prefix} (${item.reason})`);
  }
  if (run.dryRun) logger.info('Dry run: nothing was written.');
}
