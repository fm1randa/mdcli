import type { ptBREntryLabels as SectionType } from '../pt-BR/entry-labels.js';

/** Entry labels and messages of the entry commands, in English. */
export const enEntryLabels: typeof SectionType = {
  notReturnedByApi: () => '(not returned by the API)',
  errorJsonOrRaw: () => 'Use either --json or --raw, not both.',
  errorUnknownTags: (list) => `Unknown tag(s): ${list}`,
  scopeThisAndFollowing: () => 'this and the following occurrences',
  scopeThisOnly: () => 'this occurrence only',
  scopeOptionDescription: (verb) =>
    `For an occurrence of a recurring series: ${verb} only this one (this, the default) or this one and the following ones (following)`,
  scopeVerbChange: () => 'change',
  scopeVerbDelete: () => 'delete',
  errorNotPartOfSeries: (id) =>
    `Entry ${id} is not part of a recurring series, so --scope following does not apply.`,
  errorSeriesOccurrenceId: (id) =>
    `"${id}" is a series occurrence ID, not an entry ID. ` +
    'For a card purchase, find the entry ID with: mdcli entries list -a <card> --json (or mdcli cards invoice -a <card> --json)',
  errorInvalidEntryId: () => 'Invalid entry ID. Must be a number.',
  errorInvoiceNotFound: (date) =>
    `Could not find the invoice for ${date}. Pass it explicitly with --invoice YYYY-MM.`,
  warningCardEntryIdNotFound: (id, dueDate, cardId, month) =>
    `⚠ The API answered with "${id}", which is not an entry ID, and the purchase was not found in the ` +
    `${dueDate} invoice. Find its ID with: mdcli cards invoice -a ${cardId} --month ${month} --json`,
  warningScheduledEntryIdNotFound: (id, accountId) =>
    `⚠ The API answered with "${id}", which is not an entry ID, and the scheduled entry was not found in the ` +
    `account's entries. Find its ID with: mdcli entries list -a ${accountId} --json`,
  errorUnknownEntryType: (input) =>
    `Unknown type: ${input}. Valid: expense (d), income (r), transfer (t)`,
  errorTransferNeedsDestination: () =>
    'A transfer needs a destination account. Use --to-account <id|alias> (--account is the origin).',
  errorToAccountOnlyTransfers: () => '--to-account only applies to transfers (-T transfer).',
  errorCategoryRequiredForEntry: () =>
    'A category is required to create an entry. Use -c, --category <id|alias>. See available categories with: mdcli categories list',
  errorPendingOrConfirmed: () => 'Use either --pending or --confirmed, not both.',
  errorInvalidDate: () => 'Invalid date. Use YYYY-MM-DD (e.g., 2026-10-03).',
  errorInvalidDateWithValue: (value) => `Invalid date "${value}". Use YYYY-MM-DD (e.g., 2026-10-03).`,
  warningAccountNotFoundInList: (id) =>
    `Account ${id} was not found in the account list. Creating the entry without the credit card fields.`,
  errorInvoiceOnlyCards: () => '--invoice only applies to credit card accounts.',
  warningCardPurchaseStatus: (flag) =>
    `Card purchases have no pending or confirmed state: the purchase goes to the invoice unreconciled. ${flag} was ignored.`,
  warningScheduledAlias: () =>
    '--scheduled is now --pending: both leave Confirmado off; the API shows the entry as scheduled when its date is in the future and as pending otherwise.',
  intervalDaily: () => 'daily',
  intervalWeekly: () => 'weekly',
  intervalMonthly: () => 'monthly',
  intervalYearly: () => 'yearly',
  scheduleEvery: (interval, frequency) => `${interval}, every ${frequency}`,
  scheduleInfinite: () => 'infinite',
  scheduleTimes: (times) => `${times} times`,
  scheduleStartingAtInstallment: (installment) => `, starting at installment ${installment}`,
  entryCreated: () => 'Entry created successfully!',
  labelInstallments: () => 'Installments',
  labelRecurrence: () => 'Recurrence',
  errorInvalidRepeatInterval: (repeat) =>
    `Invalid repeat interval: ${repeat}. Valid: daily, weekly, monthly, yearly (or d, w, m, y)`,
  errorInvalidCount: (flag, value, min) =>
    `Invalid ${flag}: ${value}. Use a whole number of at least ${min}.`,
  errorFirstInstallmentNeedsInstallments: () =>
    '--first-installment and --per-installment only apply with --installments <n>.',
  errorFrequencyNeedsRepeat: () =>
    '--frequency and --times need --repeat <interval> (or --installments <n>).',
  errorTimesWithInstallments: () =>
    '--times is for a fixed series; --installments <n> already sets how many installments there are.',
  errorFirstInstallmentPastLast: (installment, total) =>
    `--first-installment ${installment} is past the last installment (${total}).`,
  errorUnknownCategoryForEntry: (input) =>
    `Unknown category: ${input}. See available categories with: mdcli categories list --active`,
  errorCategoryInactive: (name, id) =>
    `Category "${name}" (${id}) is inactive, so the web app hides it from new entries. ` +
    'Use an active category (see: mdcli categories list --active) or reactivate it in Meu Dinheiro.',
  errorCategoryEntryTypeMismatch: (name, id, categoryType, entryType) =>
    `Category "${name}" (${id}) is ${categoryType}, but the entry type is ${entryType}. ` +
    "The web app only offers categories that match the entry's type: use -c with a category of that type " +
    '(see: mdcli categories list --active), or change -T.',
  categoryTypeExpense: () => 'an expense',
  categoryTypeIncome: () => 'income',
  categoryTypeTransfer: () => 'a transfer',
  errorTransferSameAccount: () =>
    'A transfer needs two different accounts: --to-account names the same account as --account.',
  errorTransferCreditCard: () =>
    'Transfers to or from a credit card account are not supported by the CLI yet. Use the web app.',
  errorTransferDifferentCurrencies: () =>
    'Transfers between accounts in different currencies are not supported by the CLI yet. Use the web app.',
  errorNoTransferCategory: () =>
    'No transfer category found. Pass one with -c, --category <id|alias>. See: mdcli categories list',
  errorInvoicePaymentTypeChange: () =>
    'An invoice payment cannot be turned into an expense, income, or transfer. Change it in the web app.',
  errorInvoicePaymentCategory: (id) =>
    `Invoice payment ${id} needs a transfer category. Change it in the web app.`,
  errorEntryNotTransfer: (id) =>
    `Entry ${id} is not a transfer. A transfer needs two accounts and is saved as a pair, so an entry cannot become one: ` +
    'delete it and create the transfer with: mdcli entries create -T transfer --to-account <id>.',
  errorCategoryOnlyTransfers: (name, id, entryId) =>
    `Category "${name}" (${id}) only classifies transfers, and entry ${entryId} is not a transfer. ` +
    "Use -c with a category of the entry's type (see: mdcli categories list --active).",
  entryUpdated: () => 'Entry updated successfully!',
  errorOnlyOneStatus: () => 'Use only one of --pending, --confirmed and --reconciled.',
  errorNoEntryChanges: () =>
    'No changes specified. Use options like --description, --value, --date, etc.',
  errorClosedInvoiceAccount: (id) =>
    `Entry ${id} is on a closed invoice, so its account cannot be changed (the web app locks it too).`,
  errorInvoicePaymentAccounts: (id) =>
    `Entry ${id} is an invoice payment, and an invoice payment involves a credit card: change its accounts in the web app.`,
  errorToAccountOnlyTransfersUpdate: () =>
    '--to-account only applies to transfers. Use --account to move the entry to another account.',
  warningSeriesThisOnlyUpdate: (id, repetition) =>
    `Entry ${id} is an occurrence of a recurring series (${repetition}): only this occurrence will be changed, and it will leave the series. Use --scope following to change this and the following occurrences, or --scope this to silence this warning.`,
  errorDetachedSeriesUpdate: (id, repetition) =>
    `Entry ${id} belongs to a recurring series (${repetition}), but the server no longer links it to the series (like the first occurrence, or one already confirmed or reconciled), so it changes on its own. To change the series, use --scope following on a scheduled occurrence.`,
  errorTransferToOrdinary: () =>
    'A transfer cannot be turned into an expense or an income. Delete it and create the entry you want.',
  errorAccountInactive: (name, id) =>
    `Account "${name}" (${id}) is inactive, so the web app does not offer it. ` +
    'Use an active account (see: mdcli accounts list --active) or reactivate it in Meu Dinheiro.',
  errorTransferSameAccounts: (id) =>
    `A transfer needs two different accounts: origin and destination would both be account ${id}.`,
  errorReconcileCardPurchase: () =>
    'The CLI does not reconcile card purchases: drop -r/--reconciled to move the entry to a credit card.',
  warningCardPurchaseMoveStatus: (state, flag) =>
    `Card purchases have no pending or confirmed state: the purchase goes to the invoice ${state}. ${flag} was ignored.`,
  cardPurchaseReconciledState: () => 'reconciled, as it was',
  cardPurchaseUnreconciledState: () => 'unreconciled',
  errorTransferSingleAccount: (id) =>
    `Entry ${id} is a transfer but only names one account. It cannot be updated by the CLI.`,
  warningSeriesThisOnlyDelete: (id, repetition) =>
    `Entry ${id} is an occurrence of a recurring series (${repetition}): only this occurrence will be deleted. Use --scope following to delete this and the following occurrences, or --scope this to silence this warning.`,
  errorDetachedSeriesDelete: (id, repetition) =>
    `Entry ${id} belongs to a recurring series (${repetition}), but the server no longer links it to the series (like the first occurrence, or one already confirmed or reconciled), so it is deleted on its own. To delete the series, use --scope following on a scheduled occurrence.`,
  entriesDeleteHeader: () => 'Entry to be deleted:',
  confirmDeleteSeriesEntry: () =>
    'Are you sure you want to delete this occurrence and all the following ones? (y/N) ',
  confirmDeleteEntry: () => 'Are you sure you want to delete this entry? (y/N) ',
  entryDeleted: (id) => `Entry ${id} deleted successfully!`,
  entryAndFollowingDeleted: (id) =>
    `Entry ${id} and the following occurrences deleted successfully!`,
};
