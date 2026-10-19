import Table from 'cli-table3';
import chalk from 'chalk';
import { logger } from '../../utils/logger.js';
import { exitWithError } from '../../utils/action.js';
import { normalizeEntries } from '../../lib/api.js';
import { fetchListEntries } from './card-entries.js';
import { toCsv } from '../../lib/csv.js';
import { summarize, totalRow } from '../../lib/summary.js';
import { type FilterOptions, resolveEntryFilters, resolveExcludedCategories } from './filters.js';
import { formatCurrency, formatSignedCurrency, formatStatus, formatType } from './format.js';
import { loadNames, nameOf, tagNames } from './names.js';

async function loadEntries(options: FilterOptions) {
  const params = await resolveEntryFilters(options);
  const excludedCategories = await resolveExcludedCategories(options.excludeCategory);
  const all = normalizeEntries(await fetchListEntries(params));
  const entries = all.filter((e) => e.categoryId === null || !excludedCategories.has(e.categoryId));
  return { params, entries, excludedByCategory: all.length - entries.length };
}

function checkOutputFormat(options: { json?: boolean; csv?: boolean }): void {
  if (options.json && options.csv) {
    exitWithError('Use either --json or --csv, not both.');
  }
}

interface ListOptions extends FilterOptions {
  json?: boolean;
  csv?: boolean;
}

export async function listAction(options: ListOptions): Promise<void> {
  checkOutputFormat(options);
  const { entries } = await loadEntries(options);

  if (options.json) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  if (options.csv) {
    const names = await loadNames({ tags: entries.some((e) => e.tagIds.length > 0) });
    process.stdout.write(
      toCsv(
        [
          'id', 'date', 'description', 'value', 'type', 'status', 'account', 'category', 'installment',
          'repetition', 'effective_date', 'competence_date', 'transfer_account', 'tags', 'notes', 'document_number',
        ],
        entries.map((e) => [
          e.id,
          e.date,
          e.description,
          e.value,
          e.type,
          e.status,
          nameOf(names.accounts, e.accountId),
          e.categoryId === null ? '' : nameOf(names.categories, e.categoryId),
          e.installment,
          e.repetition,
          e.effectiveDate,
          e.competenceDate,
          e.transferAccountId === null ? '' : nameOf(names.accounts, e.transferAccountId),
          tagNames(names, e.tagIds).join('; '),
          e.notes,
          e.documentNumber,
        ])
      )
    );
    return;
  }

  const table = new Table({
    head: ['ID', 'Date', 'Description', 'Value', 'Type', 'Status', 'Installment'],
    style: { head: ['cyan'] },
    colWidths: [12, 12, 36, 15, 12, 12, 13],
  });

  for (const entry of entries) {
    table.push([
      entry.id,
      entry.date,
      entry.description.length > 33 ? `${entry.description.slice(0, 33)}...` : entry.description,
      formatSignedCurrency(entry.value),
      formatType(entry.type),
      formatStatus(entry.status),
      entry.installment ?? chalk.gray('-'),
    ]);
  }

  const total = entries.reduce((sum, e) => sum + e.value, 0);
  logger.header(`Entries (${entries.length}) | Total: ${formatSignedCurrency(total)}`);
  console.log(table.toString());
}

const SUMMARY_GROUPINGS = ['category', 'month', 'account'] as const;
type SummaryGrouping = (typeof SUMMARY_GROUPINGS)[number];

interface SummaryOptions extends FilterOptions {
  by?: string;
  includeTransfers?: boolean;
  json?: boolean;
  csv?: boolean;
}

export async function summaryAction(options: SummaryOptions): Promise<void> {
  checkOutputFormat(options);
  const by = (options.by ?? 'category') as SummaryGrouping;
  if (!SUMMARY_GROUPINGS.includes(by)) {
    exitWithError(`Invalid --by "${options.by}". Use category, month, or account.`);
  }

  const { params, entries: filtered, excludedByCategory } = await loadEntries(options);
  const entries = options.includeTransfers ? filtered : filtered.filter((e) => e.type !== 'transfer');
  const skippedTransfers = filtered.length - entries.length;

  const names = by === 'month' ? null : await loadNames();
  const rows = summarize(entries, (e) => {
    if (by === 'month') {
      const month = e.date.slice(0, 7);
      return { key: month, label: month };
    }
    if (by === 'account') {
      return { key: String(e.accountId), label: String(nameOf(names?.accounts, e.accountId)) };
    }
    if (e.categoryId === null) {
      return { key: 'none', label: '(no category)' };
    }
    return { key: String(e.categoryId), label: String(nameOf(names?.categories, e.categoryId)) };
  });

  // Months read chronologically; other groupings put the biggest spending first.
  rows.sort((a, b) => (by === 'month' ? a.key.localeCompare(b.key) : a.net - b.net));
  const total = totalRow(rows);

  if (options.json) {
    console.log(
      JSON.stringify(
        { groupBy: by, from: params.startDate, to: params.endDate, skippedTransfers, excludedByCategory, rows, total },
        null,
        2
      )
    );
    return;
  }

  if (options.csv) {
    process.stdout.write(
      toCsv(
        [by, 'entries', 'income', 'expenses', 'net'],
        [...rows, total].map((r) => [r.label, r.count, r.income, r.expenses, r.net])
      )
    );
    return;
  }

  const table = new Table({
    head: [by[0].toUpperCase() + by.slice(1), 'Entries', 'Income', 'Expenses', 'Net'],
    style: { head: ['cyan'] },
  });
  for (const row of rows) {
    table.push([row.label, row.count, formatCurrency(row.income), formatCurrency(row.expenses), formatSignedCurrency(row.net)]);
  }
  table.push([
    chalk.bold(total.label),
    chalk.bold(String(total.count)),
    formatCurrency(total.income),
    formatCurrency(total.expenses),
    formatSignedCurrency(total.net),
  ]);

  logger.header(`Summary by ${by} | ${params.startDate} to ${params.endDate}`);
  console.log(table.toString());
  if (excludedByCategory > 0) {
    console.log(chalk.gray(`\n${excludedByCategory} entr${excludedByCategory === 1 ? 'y' : 'ies'} left out by --exclude-category.`));
  }
  if (skippedTransfers > 0) {
    console.log(chalk.gray(`\n${skippedTransfers} transfer(s) left out. Use --include-transfers to count them.`));
  }
}
