import type { ptBREntriesSummary as SectionType } from '../pt-BR/summary.js';
import { groupNouns, summaryGroupingMessages } from '../../summary-grouping.js';

const grouping = summaryGroupingMessages(
  groupNouns(
    { column: 'Category', header: 'category' },
    { column: 'Month', header: 'month' },
    { column: 'Account', header: 'account' },
  ),
  (noun, from, to) => `Summary by ${noun} | ${from} to ${to}`,
);

/** Entries summary, in English. */
export const enEntriesSummary: typeof SectionType = {
  entriesSummaryDescription: () =>
    'Total income and expenses grouped by category, month, or account',
  entriesSummaryByOption: () => 'Group by: category, month, or account',
  entriesSummaryIncludeTransfersOption: () =>
    'Count transfers between accounts (left out by default)',
  summaryGroupColumn: grouping.summaryGroupColumn,
  entriesSummaryHeader: grouping.entriesSummaryHeader,
  entriesExcludedByCategory: (count) =>
    `${count} entr${count === 1 ? 'y' : 'ies'} left out by --exclude-category.`,
  entriesSkippedTransfers: (count) =>
    `${count} transfer(s) left out. Use --include-transfers to count them.`,
  entriesSkippedPayments: (count) =>
    `${count} card payment(s) left out of the summary.`,
  entriesSkippedInvoices: (count) =>
    `${count} invoice projection(s) left out of the summary.`,
};
