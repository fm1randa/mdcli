import type { ptBREntriesImportOutput as SectionType } from '../pt-BR/import-output.js';

/** Import output and remaining entry labels, in English. */
export const enEntriesImportOutput: typeof SectionType = {
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
  importEditCandidates: (prefix) => `# candidates ${prefix}`,
  importEditLeftOut: (list) =>
    `# Left out (no id, date or value from the bank): ${list}`,
  importEditImportFor: (name, start, end) =>
    `# Import for ${name}, statement ${start} to ${end}.`,
  importEditCommandsHeader: () => '# Commands:',
  importEditImportCommand: () =>
    '#   import <prefix> <date> <value> <category> | <description>   create an Entry',
  importEditConciliateCommand: () =>
    '#   conciliate <prefix> [<entryId>] <date> <value> <category> | <description>   link an existing Entry',
  importEditReconciledNote: () =>
    '#     Reconciled Entries are not listed as candidates, but their id may still be written here.',
  importEditSkipCommand: () => '#   skip <prefix> ...     leave it for later',
  importEditRejectCommand: () => '#   reject <prefix> ...   mark it as not imported',
  importEditDateValueNote: () =>
    '# The date and the absolute value must be the bank ones; flipping the sign is allowed.',
  importEditCommentsNote: () =>
    '# Lines starting with # are comments. Remove every command line to cancel.',
  importEditExpectedLine: (where) =>
    `${where}: expected "<command> <prefix> <date> <value> <category> | <description>".`,
  importEditUnknownCommand: (where, command, actions) =>
    `${where}: unknown command "${command}". Use ${actions}.`,
  importEditOnlyConciliateEntryId: (id) =>
    `${id}: only conciliate takes an entry id.`,
  importEditDateMustBeBankDate: (id, date) =>
    `${id}: the date must be the bank date ${date}.`,
  importEditValueNotNumber: (id, value) =>
    `${id}: the value ${value} is not a number.`,
  importEditMoreThanOneLine: (id) => `${id}: it has more than one command line.`,
  importEditLine: (line) => `Line ${line}`,
  importEditPrefixFlag: (where) => `${where}: prefix`,
  importPrefixNoMatch: (flag, prefix) =>
    `${flag} ${prefix} does not match any bank transaction.`,
  importPrefixManyMatches: (flag, prefix, count) =>
    `${flag} ${prefix} matches ${count} bank transactions. Use a longer prefix.`,
  errorEditorRequired: () =>
    '--edit needs $EDITOR (e.g. EDITOR=vim). Nothing was written.',
  errorEditUnchangedInvalid: (errors) =>
    `The file is unchanged and still invalid. Nothing was written.\n${errors}`,
  errorCouldNotRunEditor: (editor, message) =>
    `Could not run $EDITOR (${editor}): ${message}. Nothing was written.`,
  errorEditorStopped: (editor, how) =>
    `$EDITOR (${editor}) ${how}. Nothing was written.`,
  editorStoppedBySignal: (signal) => `was stopped by ${signal}`,
  editorExitedWithCode: (status) => `exited with code ${status}`,
  errorCannotReadPlanFile: (path, message) =>
    `Cannot read the --plan file ${path}: ${message}`,
  errorPlanInvalidJson: (message) =>
    `The --plan file is not valid JSON: ${message}`,
  errorPlanNotObject: () => 'the file must be a JSON object with "transactions".',
  errorPlanUnknownKey: (key) =>
    `unknown key ${key} (the file only has "transactions").`,
  errorPlanTransactionsMustBeList: () => '"transactions" must be a list.',
  errorPlanEmpty: () => '"transactions" is empty. There is no "import everything".',
  errorPlanIdMustBeString: () => '"id" must be a prefix or UUID string.',
  errorPlanActionOneOf: (actions) => `"action" must be one of ${actions}.`,
  errorPlanKeyNotApplicable: (key, action) =>
    `${key} does not apply to ${action}.`,
  errorPlanCategory: () =>
    '"category" must be a category ID, alias, or name.',
  errorPlanValue: () => '"value" must be a number.',
  errorPlanDescription: () => '"description" must be a string.',
  errorPlanEntry: () => '"entry" must be a numeric Entry id.',
  errorPlanCategoryRequired: () => '"category" is required for import.',
  errorInvalidPlanFile: (problems) =>
    `Invalid --plan file. Nothing was imported.\n${problems}`,
  errorNothingImported: (problems) =>
    `Nothing was imported. Fix the selection:\n${problems}`,
  importNoBankDate: () => 'the bank did not send a date.',
  importZeroValue: () => 'the value is zero.',
  errorWrittenValue: (value, bankValue) =>
    `value ${value} is not the bank value ${bankValue}. Only the sign can change.`,
  importNoCategory: () => 'it has no category.',
  importNoBankValue: () => 'the bank did not send a value.',
  errorCategoryExpenseNegative: (name) =>
    `category "${name}" is an expense, so the value must be negative.`,
  errorCategoryIncomePositive: (name) =>
    `category "${name}" is income, so the value must be positive.`,
  errorCategoryIsTransfer: (name) => `category "${name}" is a transfer.`,
  importDryRunHeader: (name, connectionAccount) =>
    `Import dry run for ${name} (connection account ${connectionAccount})`,
  importRunHeader: (name, connectionAccount) =>
    `Import for ${name} (connection account ${connectionAccount})`,
  importStatementSummary: (start, end, balance) =>
    `Statement ${start} to ${end}, balance ${balance}`,
  importCounts: (imported, conciliated, rejected, skipped) =>
    `Import ${imported}, conciliate ${conciliated}, reject ${rejected}, skip ${skipped}.`,
  importNewEntriesHeader: () => 'New entries',
  importLinkedEntriesHeader: () => 'Linked entries',
  importRejectedHeader: () => 'Rejected',
  importSkippedHeader: () => 'Skipped',
  importSkipReasonDuplicate: () => 'duplicate',
  importSkipReasonPlan: () => 'plan',
  importDryRunNote: () => 'Dry run: nothing was written.',
  importReconciledKeepsFields: (prefix, entryId) =>
    `${prefix} (entry ${entryId}) is already reconciled: ` +
    'the web only overwrites entries that are not reconciled, so it keeps its fields.',
  importOverwrittenHeader: () => 'Overwritten by the bank',
  importOverwriteUnavailable: () =>
    'The overwrite preferences could not be read, so the web default applies: linked entries keep their fields.',
  importOverwriteOn: (fields) =>
    `Overwrite on (your web preference): linked entries that are not reconciled take the bank transaction's ${fields}.`,
  importOverwriteOff: (fields) =>
    `Overwrite off (your web preference): linked entries keep their ${fields}; ` +
    "with it on, the ones that are not reconciled would take the bank transaction's.",
  importOverwriteFields: () =>
    'contact, category, cost center, project, tags and document number',
  importFillDescriptionOn: () =>
    "Fill empty descriptions on (your web preference): a linked entry without a description takes the bank transaction's.",
  importFillDescriptionOff: () =>
    'Fill empty descriptions off (your web preference): linked entries keep their description.',
  errorImportJsonRequires: () => 'entries import run --json requires --yes or --dry-run',
  importNothingToDo: () =>
    'Nothing to do: the file has no command lines. Nothing was written.',
  importNothingNewWritten: (message) => `${message} Nothing was written.`,
  confirmImport: () => 'Write this import to Meu Dinheiro? (y/N) ',
  importCancelled: () => 'Import cancelled. Nothing was written.',
  importWritten: (name) => `Import written for ${name}.`,
  errorPlanDoesNotCombineWithEdit: () => '--plan does not combine with --edit.',
  errorFlagDoesNotCombine: (flag, source) =>
    `${flag} does not combine with ${source}. Every choice goes in the ${source} file.`,
  errorCategoryOnlyIds: () => '--category only applies to --ids.',
  errorIdsNeedsCategory: () =>
    '--ids needs -c, --category: every Entry the import creates has a category.',
  errorNothingSelected: (listCommand) =>
    'Nothing selected. Use --ids with --category, --reject, --plan, or --edit. There is no "import everything". ' +
    `To see what would be imported, with the suggested categories and actions, use: ${listCommand}`,
  errorPrefixInBoth: (prefix) => `${prefix} is in both --ids and --reject.`,
  errorSelectedByBoth: (prefix) =>
    `${prefix} is selected by both --ids and --reject.`,
  errorPrefixNeedsOne: (flag) => `${flag} needs at least one prefix.`,
  errorEntryIdNotEntry: (input) =>
    `entry ${input} is not an Entry id (a whole number from 1 to ${Number.MAX_SAFE_INTEGER}).`,
  errorImportTransferCategory: (name, id) =>
    `Category "${name}" (${id}) is a transfer category. Import does not create transfers.`,
  errorSelectedTwice: (label, first, second) =>
    `${label}: selected twice (${first} and ${second}).`,
  errorEntryAlreadyRecords: (id) =>
    `entry ${id} already records it (linked automatically). Use conciliate, or skip it.`,
  errorEntryNotCandidate: (entryId, known) =>
    `entry ${entryId} is not a candidate (${known}).`,
  importNoCandidates: () => 'it has no candidates',
  importCandidatesList: (ids) => `candidates: ${ids}`,
  errorNoEntryMatches: () =>
    'no entry matches it, so there is nothing to link.',
  errorEntriesMayMatch: (count, ids, hint) =>
    `${count} ${count === 1 ? 'entry' : 'entries'} may match it (${ids}), none linked automatically. ${hint}`,
  importEntryHintEdit: (prefix) =>
    `Write the one to link: conciliate ${prefix} <entryId> ...`,
  importEntryHintPlan: () => 'Say which one with "entry".',
  errorEarliestStart: (floor) =>
    `The earliest start date is ${floor}. Bank transactions can only be loaded for the last 90 days.`,
  errorLatestStart: (day) => `The latest start date is today (${day}).`,
  errorMarkImportedFailed: (message) => `markImported failed: ${message}`,
  errorPagesWritten: (message, index, total) =>
    `${message} Pages written before the failure: ${index} of ${total}.`,
  errorBankTransactionNoDate: (id) => `Bank transaction ${id} has no date.`,
};
