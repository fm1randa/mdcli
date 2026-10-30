import type { ptBREntriesManage as SectionType } from '../pt-BR/manage.js';

/** Entries manage and list, in English. */
export const enEntriesManage: typeof SectionType = {
  entriesManageDescription: () => 'Manage entries (lancamentos)',
  entriesListDescription: () => 'List entries for one or more accounts',
  entriesListCsvOption: () => 'Output as CSV (with account and category names)',
  entriesShowDescription: () => 'Show every field of one entry',
  entriesShowJsonOption: () =>
    'Output the normalized entry as JSON (the same fields as list --json)',
  entriesShowRawOption: () => 'Output the entry exactly as the API returns it',
};
