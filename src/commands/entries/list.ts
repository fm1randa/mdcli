import chalk from 'chalk';
import { logger } from '../../utils/logger.js';
import { t } from '../../lib/i18n/index.js';
import { parseSummaryGrouping } from '../../lib/i18n/summary-grouping.js';
import { exitAfterFlush, exitWithError } from '../../utils/action.js';
import { fetchWebConfig, normalizeEntries } from '../../lib/api.js';
import { competenceViewEnabled } from '../../lib/entries-preferences.js';
import { fetchListEntries, type FailedInvoice } from './card-entries.js';
import { toCsv } from '../../lib/csv.js';
import { summarize, totalRow } from '../../lib/summary.js';
import { type FilterOptions, resolveEntryFilters, resolveExcludedCategories } from './filters.js';
import { formatStatus, formatType } from './format.js';
import { formatCurrency, formatMagnitude } from '../../utils/currency.js';
import { loadNames, nameOf, tagNames } from './names.js';
import { cell, truncate } from '../../utils/text.js';
import { newTable } from '../../utils/table.js';
import type { ApiRegime } from '../../types/index.js';
import { parseRegime, regimeCode, type Regime } from '../../lib/regime.js';

const LIST_COL_WIDTHS = [12, 12, 36, 15, 12, 12, 13];

function reportFailedInvoices(failures: FailedInvoice[]): void {
  for (const failure of failures) {
    console.error(
      chalk.yellow('⚠'),
      t('warningInvoiceReadFailed', failure.cardName, failure.cardId, failure.dueDate, failure.message),
    );
  }
}

async function loadEntries(options: FilterOptions, regime?: ApiRegime) {
  const resolved = await resolveEntryFilters(options);
  const params = { ...resolved.params, regime };
  const { accounts } = resolved;
  const excludedCategories = await resolveExcludedCategories(options.excludeCategory);
  const policy = options.account === undefined ? 'continue' : 'strict';
  const loaded = await fetchListEntries(params, accounts, policy);
  const all = normalizeEntries(loaded.entries);
  const entries = all.filter((e) => e.categoryId === null || !excludedCategories.has(e.categoryId));
  reportFailedInvoices(loaded.failedInvoices);
  if (loaded.failedInvoices.length > 0 && entries.length === 0) {
    await exitAfterFlush(1);
  }
  return { params, accounts, entries, excludedByCategory: all.length - entries.length };
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
  const { accounts, entries } = await loadEntries(options);

  if (options.json) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  if (options.csv) {
    const names = await loadNames({ tags: entries.some((e) => e.tagIds.length > 0), accounts });
    process.stdout.write(
      toCsv(
        [
          'id', 'date', 'description', 'value', 'type', 'status', 'account', 'category', 'installment',
          'repetition', 'effective_date', 'competence_date', 'transfer_account', 'tags', 'notes', 'document_number', 'savings_goal_id',
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
          e.savingsGoalId,
        ])
      )
    );
    return;
  }

  const table = newTable({
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

/**
 * The --regime of the web reports' "Visão de caixa" / "Visão da competência" toggle. The web offers
 * accrual only under visaoCompetencia and silently sends cash otherwise; the CLI refuses instead.
 */
async function resolveSummaryRegime(input: string | undefined): Promise<Regime | undefined> {
  if (input === undefined) return undefined;
  const regime = parseRegime(input);
  if (regime === null) exitWithError(t('errorInvalidRegime', input));
  if (regime === 'accrual' && !(await competenceViewEnabled(fetchWebConfig()))) {
    exitWithError(t('errorAccrualViewOff'));
  }
  return regime;
}

interface SummaryOptions extends FilterOptions {
  by?: string;
  regime?: string;
  includeTransfers?: boolean;
  json?: boolean;
  csv?: boolean;
}

export async function summaryAction(options: SummaryOptions): Promise<void> {
  checkOutputFormat(options);
  const by = parseSummaryGrouping(options.by);
  if (by === undefined) {
    exitWithError(t('errorInvalidBy', options.by ?? ''));
  }

  const regime = await resolveSummaryRegime(options.regime);
  const { params, accounts, entries: filtered, excludedByCategory } = await loadEntries(options, regime && regimeCode(regime));
  // Transfers stay optional via --include-transfers. Payments (tipo p) and
  // invoice projections are never income/expense: always leave them out of
  // the summary (real use 2026-10-19).
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

  const names = by === 'month' ? null : await loadNames({ accounts });
  const rows = summarize(entries, (e) => {
    if (by === 'month') {
      const month = (regime === 'accrual' ? (e.competenceDate ?? e.date) : e.date).slice(0, 7);
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
        { groupBy: by, regime: regime ?? null, from: params.startDate, to: params.endDate, skippedTransfers, skippedPayments, skippedInvoices, excludedByCategory, rows, total },
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

  const table = newTable({
    head: [
      t('summaryGroupColumn', by),
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

  const header = t('entriesSummaryHeader', by, params.startDate, params.endDate);
  logger.header(regime ? `${header} | ${t(regime === 'cash' ? 'summaryRegimeCash' : 'summaryRegimeAccrual')}` : header);
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
