import { fetchCategories, fetchTags } from '../../../lib/api.js';
import type { Category } from '../../../types/index.js';
import { formatCurrency } from '../../../utils/currency.js';
import { logger } from '../../../utils/logger.js';
import { t } from '../../../lib/i18n/index.js';
import { cell, listCell } from '../../../utils/text.js';
import type { OverwrittenFields } from './candidates.js';
import type { RunDocument } from './plan.js';
import { newTable } from '../../../utils/table.js';

/** Category and tag names for the overwritten fields; contact, cost center and project stay ids. */
interface OverwrittenNames {
  categories: Map<number, string>;
  tags: Map<number, string>;
}

type ConciliatedItem = RunDocument['conciliated'][number];

/** The summary of a run: statement, counts, and each item by action. */
export function printRun(
  run: RunDocument,
  context: { accountName: string | null; categories: readonly Category[]; names: OverwrittenNames | null },
): void {
  const name = context.accountName ?? String(run.accountId);
  logger.header(
    run.dryRun
      ? t('importDryRunHeader', name, run.connectionAccount)
      : t('importRunHeader', name, run.connectionAccount)
  );
  const { start, end, balance } = run.statement;
  console.log(
    t('importStatementSummary', start ?? '-', end ?? '-', balance === null ? '-' : formatCurrency(balance)),
  );
  console.log(
    t('importCounts', run.imported.length, run.conciliated.length, run.rejected.length, run.skipped.length),
  );

  if (run.imported.length > 0) {
    const table = newTable({
      head: [t('labelPrefix'), t('labelDate'), t('labelValue'), t('labelDescription'), t('labelCategory'), t('labelTags'), t('labelStatus')],
      style: { head: ['cyan'] },
    });
    for (const item of run.imported) {
      table.push([
        item.prefix,
        item.date,
        formatCurrency(item.value),
        cell(item.description),
        context.categories.find((category) => category.id === item.categoryId)?.nome ?? String(item.categoryId),
        listCell(item.tagIds),
        item.status === 'reconciled' ? t('statusReconciled') : t('statusScheduled'),
      ]);
    }
    logger.header(t('importNewEntriesHeader'));
    console.log(table.toString());
  }

  if (run.conciliated.length > 0) {
    const table = newTable({
      head: [
        t('labelPrefix'),
        t('labelEntry'),
        t('labelValueBefore'),
        t('labelValueAfter'),
        t('labelDescriptionBefore'),
        t('labelDescriptionAfter'),
      ],
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
    logger.header(t('importLinkedEntriesHeader'));
    console.log(table.toString());
    printOverwritten(run.conciliated, context.names);
    for (const note of overwriteNotes(run.overwrite)) logger.info(note);
  }

  if (run.rejected.length > 0) {
    logger.header(t('importRejectedHeader'));
    for (const item of run.rejected) console.log(`  ${item.prefix}`);
  }
  if (run.skipped.length > 0) {
    logger.header(t('importSkippedHeader'));
    for (const item of run.skipped) {
      const reason = item.reason === 'duplicate' ? t('importSkipReasonDuplicate') : t('importSkipReasonPlan');
      console.log(`  ${item.prefix} (${reason})`);
    }
  }
  if (run.dryRun) logger.info(t('importDryRunNote'));
}

/**
 * Names for the summary of the fields `sobrescrever` replaces, or null when nothing is replaced.
 * Tags are fetched only when a side has one.
 */
export async function overwrittenNames(run: RunDocument): Promise<OverwrittenNames | null> {
  const replaced = run.conciliated.filter((item) => item.reconciled === false);
  if (!run.overwrite.value || replaced.length === 0) return null;
  const hasTags = replaced.some((item) => (item.before.tagIds?.length ?? 0) + (item.after.tagIds?.length ?? 0) > 0);
  const [categories, tags] = await Promise.all([fetchCategories(), hasTags ? fetchTags() : Promise.resolve([])]);
  return {
    categories: new Map(categories.items.map((category) => [category.id, category.nome])),
    tags: new Map(tags.map((tag) => [tag.id, tag.nome])),
  };
}

/** The overwritten fields, in the web dialog's order. */
const FIELD_LABELS: readonly [keyof OverwrittenFields, () => string][] = [
  ['contactId', () => t('labelContact')],
  ['categoryId', () => t('labelCategory')],
  ['costCenterId', () => t('labelCostCenter')],
  ['projectId', () => t('labelProject')],
  ['tagIds', () => t('labelTags')],
  ['documentNumber', () => t('labelDocumentNumber')],
];

/** With `sobrescrever` on: each replaced field before and after, and why a reconciled Entry keeps them. */
function printOverwritten(items: readonly ConciliatedItem[], names: OverwrittenNames | null): void {
  const replaced = items.filter((item) => item.reconciled === false);
  for (const item of items) {
    if (item.reconciled !== true) continue;
    logger.info(t('importReconciledKeepsFields', item.prefix, item.entryId));
  }
  if (replaced.length === 0) return;
  const table = newTable({
    head: [t('labelPrefix'), t('labelEntry'), t('labelField'), t('labelBefore'), t('labelAfter')],
    style: { head: ['cyan'] },
  });
  for (const item of replaced) {
    for (const [key, label] of FIELD_LABELS) {
      table.push([
        item.prefix,
        String(item.entryId),
        label(),
        fieldText(key, item.before[key], names),
        fieldText(key, item.after[key], names),
      ]);
    }
  }
  logger.header(t('importOverwrittenHeader'));
  console.log(table.toString());
}

function fieldText(key: keyof OverwrittenFields, value: OverwrittenFields[keyof OverwrittenFields] | undefined, names: OverwrittenNames | null): string {
  if (value === null || value === undefined) return cell(null);
  if (Array.isArray(value)) return listCell(value, (id) => names?.tags.get(id) ?? String(id));
  if (key === 'categoryId' && typeof value === 'number') return names?.categories.get(value) ?? String(value);
  return cell(String(value));
}



/**
 * What the overwrite preference does to the linked Entries, in the web dialog's terms for a bank import:
 * "Atualizar os lançamentos não conciliados com as informações disponíveis no arquivo"
 * (partials/importacao__v2-importacao-confirmar.html, line 1, `tipoArquivo != 'ofx'`).
 */
function overwriteNotes(overwrite: RunDocument['overwrite']): string[] {
  if (overwrite.source === 'default') {
    return [t('importOverwriteUnavailable')];
  }
  const fields = t('importOverwriteFields');
  return [
    overwrite.value
      ? t('importOverwriteOn', fields)
      : t('importOverwriteOff', fields),
    overwrite.description
      ? t('importFillDescriptionOn')
      : t('importFillDescriptionOff'),
  ];
}
