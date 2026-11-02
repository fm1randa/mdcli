import type { ptBREntriesUpdateDelete as SectionType } from '../pt-BR/update-delete.js';

/** Entries update, delete, and filter, in English. */
export const enEntriesUpdateDelete: typeof SectionType = {
  entriesUpdateDescription: () =>
    'Update an existing entry (partial update - only send fields you want to change)',
  entriesUpdateAccountOption: () =>
    'Move the entry to this account: ID, alias, or exact name (case-insensitive); for a transfer, the origin account',
  entriesUpdateToAccountOption: () =>
    'Transfers: move the destination to this account (ID, alias, or exact name)',
  entriesUpdateValueOption: () => 'Entry value (e.g. 10.50 or 10,50)',
  entriesUpdateTypeOption: () => 'Entry type: expense, income, transfer',
  entriesUpdateCategoryOption: () =>
    'Category ID, alias, or exact name (case-insensitive)',
  entriesUpdateDateOption: () => 'Entry date (YYYY-MM-DD)',
  entriesUpdatePendingOption: () =>
    'Set as not confirmed: clears the effective date and value (pending up to today, scheduled for a future date)',
  entriesUpdateConfirmedOption: () =>
    'Set as confirmed, not reconciled (confirms a pending or scheduled entry)',
  entriesUpdateReconciledOption: () => 'Set as reconciled',
  entriesFilterAccountOption: () =>
    'Account ID(s), alias(es), or exact name(s) (case-insensitive), comma-separated',
  entriesFilterFromOption: () =>
    'Start date (YYYY-MM-DD), defaults to first day of current month',
  entriesFilterToOption: () =>
    'End date (YYYY-MM-DD), defaults to last day of current month (API limit 2031-12-31)',
  entriesFilterStatusOption: () =>
    'Filter by status: pending, confirmed, reconciled, scheduled (or bitmask 0-15)',
  entriesFilterTypeOption: () =>
    'Filter by type: expense, income, transfer-out, transfer-in (or bitmask 0-15)',
  entriesFilterRepetitionOption: () =>
    'Filter by repetition: single, installment, fixed (or bitmask 0-7)',
  entriesFilterCategoryOption: () =>
    'Filter by category ID(s), alias(es), or exact name(s) (case-insensitive), comma-separated',
  entriesFilterTagOption: () =>
    'Filter by tag ID(s), alias(es), or exact name(s) (case-insensitive), comma-separated',
  entriesFilterKeywordsOption: () => 'Search by keywords',
  entriesFilterValueOption: () => 'Filter by value',
  entriesFilterExcludeCategoryOption: () =>
    'Leave out these categories and their subcategories, comma-separated',
  entriesFilterNoInvoicesOption: () =>
    'Omit credit-card invoice projections (API faturas: false; default includes them)',
  errorInvalidFilterDate: (flag, value) => `Invalid ${flag} date: ${value}. Use YYYY-MM-DD.`,
  errorPastLastLoadableDate: (to, last) =>
    `--to ${to} is past ${last}, the last date Meu Dinheiro loads entries for. Use --to ${last} or earlier.`,
  errorUnknownFilterValue: (label, unknown, valid) => `Unknown ${label}: ${unknown}. Valid: ${valid}`,
  filterLabelStatus: () => 'status',
  filterLabelType: () => 'type',
  filterLabelRepetition: () => 'repetition',
  errorAccountRequired: () =>
    'At least one account ID or alias is required. Use --account <id> or --account <id1,id2,...>',
  errorUnknownAccounts: (list) => `Unknown account(s): ${list}`,
  errorUnknownCategories: (list) => `Unknown category(ies): ${list}`,
  errorUnknownCategoriesExclude: (list) =>
    `Unknown category(ies) in --exclude-category: ${list}`,
  errorInvalidValue: (value) =>
    `Invalid value "${value}". Use a number like 10, 10.50 or 10,50.`,
  errorJsonOrCsv: () => 'Use either --json or --csv, not both.',
  entriesListHeader: (count, total) => `Entries (${count}) | Total: ${total}`,
  errorInvalidBy: (value) => `Invalid --by "${value}". Use category, month, or account.`,
  labelNoCategory: () => '(no category)',
};
