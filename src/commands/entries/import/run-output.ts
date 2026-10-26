import Table from 'cli-table3';
import { fetchCategories, fetchTags } from '../../../lib/api.js';
import type { Category } from '../../../types/index.js';
import { formatCurrency } from '../../../utils/currency.js';
import { logger } from '../../../utils/logger.js';
import { cell, listCell } from '../../../utils/text.js';
import type { OverwrittenFields } from './candidates.js';
import type { RunDocument } from './plan.js';

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
        listCell(item.tagIds),
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
    printOverwritten(run.conciliated, context.names);
    for (const note of overwriteNotes(run.overwrite)) logger.info(note);
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
const FIELD_LABELS: readonly [keyof OverwrittenFields, string][] = [
  ['contactId', 'Contact'],
  ['categoryId', 'Category'],
  ['costCenterId', 'Cost center'],
  ['projectId', 'Project'],
  ['tagIds', 'Tags'],
  ['documentNumber', 'Document number'],
];

/** With `sobrescrever` on: each replaced field before and after, and why a reconciled Entry keeps them. */
function printOverwritten(items: readonly ConciliatedItem[], names: OverwrittenNames | null): void {
  const replaced = items.filter((item) => item.reconciled === false);
  for (const item of items) {
    if (item.reconciled !== true) continue;
    logger.info(
      `${item.prefix} (entry ${item.entryId}) is already reconciled: ` +
        'the web only overwrites entries that are not reconciled, so it keeps its fields.',
    );
  }
  if (replaced.length === 0) return;
  const table = new Table({ head: ['Prefix', 'Entry', 'Field', 'Before', 'After'], style: { head: ['cyan'] } });
  for (const item of replaced) {
    for (const [key, label] of FIELD_LABELS) {
      table.push([
        item.prefix,
        String(item.entryId),
        label,
        fieldText(key, item.before[key], names),
        fieldText(key, item.after[key], names),
      ]);
    }
  }
  logger.header('Overwritten by the bank');
  console.log(table.toString());
}

function fieldText(key: keyof OverwrittenFields, value: OverwrittenFields[keyof OverwrittenFields] | undefined, names: OverwrittenNames | null): string {
  if (value === null || value === undefined) return cell(null);
  if (Array.isArray(value)) return listCell(value, (id) => names?.tags.get(id) ?? String(id));
  if (key === 'categoryId' && typeof value === 'number') return names?.categories.get(value) ?? String(value);
  return cell(String(value));
}

const OVERWRITTEN = 'contact, category, cost center, project, tags and document number';

/**
 * What the overwrite preference does to the linked Entries, in the web dialog's terms for a bank import:
 * "Atualizar os lançamentos não conciliados com as informações disponíveis no arquivo"
 * (partials/importacao__v2-importacao-confirmar.html, line 1, `tipoArquivo != 'ofx'`).
 */
function overwriteNotes(overwrite: RunDocument['overwrite']): string[] {
  if (overwrite.source === 'default') {
    return ['The overwrite preferences could not be read, so the web default applies: linked entries keep their fields.'];
  }
  return [
    overwrite.value
      ? `Overwrite on (your web preference): linked entries that are not reconciled take the bank transaction's ${OVERWRITTEN}.`
      : `Overwrite off (your web preference): linked entries keep their ${OVERWRITTEN}; ` +
        "with it on, the ones that are not reconciled would take the bank transaction's.",
    overwrite.description
      ? "Fill empty descriptions on (your web preference): a linked entry without a description takes the bank transaction's."
      : 'Fill empty descriptions off (your web preference): linked entries keep their description.',
  ];
}
