import type { ptBREntriesCreate as SectionType } from '../pt-BR/create.js';

/** Entries create, in English. */
export const enEntriesCreate: typeof SectionType = {
  entriesCreateDescription: () => 'Create a new entry',
  entriesCreateAccountOption: () =>
    'Account ID, alias, or exact name (case-insensitive); for a transfer, the origin account',
  entriesCreateDescriptionOption: () => 'Entry description',
  entriesCreateValueOption: () =>
    'Entry value (positive number, e.g. 10.50 or 10,50); with --installments, the total unless --per-installment',
  entriesCreateTypeOption: () => 'Entry type: expense, income, transfer (default: expense)',
  entriesCreateToAccountOption: () =>
    'Transfers: destination account ID, alias, or exact name (required with -T transfer)',
  entriesCreateCategoryOption: () =>
    'Category ID, alias, or exact name (case-insensitive) (required; transfers default to the transfer category)',
  entriesCreateDateOption: () =>
    'Entry date (YYYY-MM-DD), defaults to today; with --installments, the first installment',
  entriesTagsOption: () =>
    'Tag ID(s), alias(es), or exact name(s) (case-insensitive), comma-separated',
  entriesNotesOption: () => 'Additional notes/observations',
  entriesCreatePendingOption: () =>
    'Create as not confirmed (Confirmado off in the web app, no effective date): pending up to today, scheduled for a future date',
  entriesCreateConfirmedOption: () =>
    'Create as confirmed, not reconciled (default: reconciled)',
  entriesScheduledAliasOption: () => 'Deprecated alias of --pending',
  entriesCreateRepeatOption: () =>
    'Recurrence: daily, weekly, monthly, yearly (or d, w, m, y); with --installments, the spacing (default: monthly)',
  entriesCreateFrequencyOption: () =>
    'Repeat every N intervals, e.g. --frequency 2 = every 2 months (default: 1)',
  entriesCreateTimesOption: () =>
    'Fixed series: total occurrences, e.g. --times 6 = 6 times then stop (default: infinite)',
  entriesCreateInstallmentsOption: () =>
    'Installment series (parcelada): split --value into N installments (N >= 2)',
  entriesCreateFirstInstallmentOption: () =>
    'Installments: number of the first installment, as in the web app (default: 1)',
  entriesCreatePerInstallmentOption: () =>
    'Installments: --value is each installment, not the total',
  entriesCreateInvoiceOption: () =>
    'Credit cards: invoice month to post to (default: the invoice the date falls in)',
};
