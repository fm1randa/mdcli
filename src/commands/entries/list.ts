import Table from 'cli-table3';
import chalk from 'chalk';
import { logger } from '../../utils/logger.js';
import { t } from '../../lib/i18n/index.js';
import { exitWithError } from '../../utils/action.js';
import { normalizeEntries } from '../../lib/api.js';
import { fetchListEntries } from './card-entries.js';
import { toCsv } from '../../lib/csv.js';
import { summarize, totalRow } from '../../lib/summary.js';
import { type FilterOptions, resolveEntryFilters, resolveExcludedCategories } from './filters.js';
import { formatStatus, formatType } from './format.js';
import { formatCurrency, formatMagnitude } from '../../utils/currency.js';
import { loadNames, nameOf, tagNames } from './names.js';
import { cell, truncate } from '../../utils/text.js';

const LIST_COL_WIDTHS = [12, 12, 36, 15, 12, 12, 13];

async function loadEntries(options: FilterOptions) {
  const params = await resolveEntryFilters(options);
  const excludedCategories = await resolveExcludedCategories(options.excludeCategory);
  const all = normalizeEntries(await fetchListEntries(params));
  const entries = all.filter((e) => e.categoryId === null || !excludedCategories.has(e.categoryId));
  return { params, entries, excludedByCategory: all.length - entries.length };
}

function checkOutputFormat(options: { json?: boolean; csv?: boolean }): void {
  if (options.json && options.csv) {
    exitWithError(t('errorJsonOrCsv'));
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
    head: [t('labelId'), t('labelDate'), t('labelDescription'), t('labelValue'), t('labelType'), t('labelStatus'), t('labelInstallment')],
    style: { head: ['cyan'] },
    colWidths: LIST_COL_WIDTHS,
  });

  for (const entry of entries) {
    table.push([
      entry.id,
      entry.date,
      truncate(entry.description, LIST_COL_WIDTHS[2]),
      formatCurrency(entry.value),
      formatType(entry.type),
      formatStatus(entry.status),
      cell(entry.installment),
    ]);
  }

  const total = entries.reduce((sum, e) => sum + e.value, 0);
  logger.header(t('entriesListHeader', entries.length, formatCurrency(total)));
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
    exitWithError(t('errorInvalidBy', options.by ?? ''));
  }

  const { params, entries: filtered, excludedByCategory } = await loadEntries(options);
  // Transfers stay optional via --include-transfers. Payments (tipo p) and
  // invoice projections are never income/expense: always leave them out of
  // the summary (dogfood 2026-10-19).
  const skippedTransfers = options.includeTransfers
    ? 0
    : filtered.filter((e) => e.type === 'transfer').length;
  const skippedPayments = filtered.filter((e) => e.type === 'payment').length;
  const skippedInvoices = filtered.filter((e) => e.type === 'invoice').length;
  const entries = filtered.filter((e) => {
    if (e.type === 'payment' || e.type === 'invoice') return false;
    if (e.type === 'transfer') return Boolean(options.includeTransfers);
    return true;
  });

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
      return { key: 'none', label: t('labelNoCategory') };
    }
    return { key: String(e.categoryId), label: String(nameOf(names?.categories, e.categoryId)) };
  });

  // Months read chronologically; other groupings put the biggest spending first.
  rows.sort((a, b) => (by === 'month' ? a.key.localeCompare(b.key) : a.net - b.net));
  const total = totalRow(rows);

  if (options.json) {
    console.log(
      JSON.stringify(
        { groupBy: by, from: params.startDate, to: params.endDate, skippedTransfers, skippedPayments, skippedInvoices, excludedByCategory, rows, total },
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
    head: [
      by === 'month' ? t('summaryGroupMonth') : by === 'account' ? t('summaryGroupAccount') : t('summaryGroupCategory'),
      t('labelEntries'),
      t('labelIncome'),
      t('labelExpenses'),
      t('labelNet'),
    ],
    style: { head: ['cyan'] },
  });
  for (const row of rows) {
    table.push([row.label, row.count, formatMagnitude(row.income), formatMagnitude(row.expenses), formatCurrency(row.net)]);
  }
  table.push([
    chalk.bold(total.label),
    chalk.bold(String(total.count)),
    formatMagnitude(total.income),
    formatMagnitude(total.expenses),
    formatCurrency(total.net),
  ]);

  logger.header(t('entriesSummaryHeader', by, params.startDate, params.endDate));
  console.log(table.toString());
  if (excludedByCategory > 0) {
    console.log(chalk.gray(`\n${t('entriesExcludedByCategory', excludedByCategory)}`));
  }
  if (skippedTransfers > 0) {
    console.log(chalk.gray(`\n${t('entriesSkippedTransfers', skippedTransfers)}`));
  }
  if (skippedPayments > 0) {
    console.log(chalk.gray(`\n${t('entriesSkippedPayments', skippedPayments)}`));
  }
  if (skippedInvoices > 0) {
    console.log(chalk.gray(`\n${t('entriesSkippedInvoices', skippedInvoices)}`));
  }
}
