import type { ptBRImport as SectionType } from '../pt-BR/import.js';

/** Import, in English. Typed by the pt-BR section, so a missing key fails typecheck. */

export const enImport: typeof SectionType = {
  // --- Import --------------------------------------------------------------------
  importCommandDescription: () => 'List and import bank transactions from a bank connection',
  importListDescription: () => 'List bank transactions for one account',
  importAccountOption: () => 'Account ID, alias, or exact name (case-insensitive)',
  importSinceHelp: () =>
    'Load the full statement from this date (YYYY-MM-DD, at most 90 days ago), already imported or not. ' +
    'Default: the new bank transactions the connection reports; without them, the statement since the ' +
    "account's last statement date (or 90 days ago, if that is earlier), like the web import button",
  importSearchFromHelp: () =>
    'Earliest candidate date (YYYY-MM-DD). Default: two days before the statement starts',
  importSearchToHelp: () =>
    'Latest candidate date (YYYY-MM-DD). Default: two days after the statement ends',
  importNotes: () =>
    '\nWithout --since, the new bank transactions the connection reports (its summary, the web\'s import\n' +
    'badge) are loaded. A connection read without a sync rarely has a summary; without one, the statement\n' +
    "loads from the web import dialog's default date: the account's last statement date, or 90 days ago\n" +
    'if that is earlier or missing. --since loads the statement from another date.\n' +
    '\nEach bank transaction is linked to at most one existing entry (conciliateWith), as the web does:\n' +
    'same value; an entry on the bank date first, then the day before, the day after, 2 days before,\n' +
    '2 days after; the same document number first. Reconciled entries are not listed as candidates and are\n' +
    'linked only on the same day, but --plan ("entry") and --edit (conciliate <prefix> <entryId>)\n' +
    'may still name one. On a credit card the candidates are the whole invoice of its next due date\n' +
    '(proximoVencimento), with no date window; a card without one cannot be imported.\n' +
    '\nAI suggestions come from the server and may differ between runs; pin the category with\n' +
    '--category, --plan or --edit.',
  importRunDescription: () =>
    'Import selected bank transactions for one account (asks y/N before writing)',
  importIdsOption: () =>
    'Comma-separated integrationId prefixes to import with --category',
  importCategoryOption: () =>
    'Category ID, alias, or exact name for every --ids item',
  importRejectOption: () =>
    'Comma-separated integrationId prefixes to mark as not imported',
  importPlanOption: () =>
    'JSON file with one action per bank transaction (import, conciliate, reject, skip)',
  importEditOption: () =>
    'Choose the action, category, and description of each bank transaction in $EDITOR',
  importIncludeDuplicatesOption: () =>
    'Import duplicates instead of skipping them (--ids; --edit opens them as import)',
  importDryRunOption: () => 'Show what would be imported without writing anything',
  importYesOption: () => 'Skip the confirmation prompt',
  importJsonOption: () => 'Output as JSON (requires --yes or --dry-run)',
  errorConnectionMissingAccountId: (accountId, connectionId) =>
    `Account ${accountId} is linked to connection ${connectionId}, which did not include its connection account id.`,
  errorCardSearchWindow: () =>
    'A search window on a credit card is not specified. Candidates come from the current card invoice.',
  errorSearchStartAfterEnd: (from, to) =>
    `Search start ${from} is after search end ${to}.`,
  importNothingNew: (since) => `No bank transactions since ${since}.`,
  importNothingNewHint: (floor) =>
    ` To look further back, use --since <YYYY-MM-DD> (${floor} or later).`,
  importCandidateLinked: (id) => `${id} (linked)`,
  importListSummaryHeader: (count, start, end) =>
    `New bank transactions (${count}), statement ${start} to ${end}`,
  importListStatementHeader: (count, since) =>
    `Bank transactions (${count}) since ${since}`,
  warningAiUnavailable: () =>
    'AI category suggestions are unavailable. Only the learned rules were applied.',
  errorCardNoDueDate: (id) =>
    `Card ${id} has no next due date in Meu Dinheiro, so there is no current invoice to find matching entries in. ` +
    'Set the card\'s due date in the web app (edit the card), then run the import again.',
  errorInvoiceNoLancamentos: (id, due) =>
    `GET /v1/cartoes/${id}/fatura/${due} did not return lancamentos`,
  errorStatementOriginSummary: () => 'Connections summary (GET /v1/integracao/connections)',
  errorStatementOriginStatement: (connectionAccount: number) => `GET /v1/integracao/account/${connectionAccount}/transactions`,
  errorStatementDidNotReturnStatement: (origin) => `${origin} did not return a statement`,
  errorStatementDidNotReturnLancamentos: (origin) =>
    `${origin} did not return lancamentos`,
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
  importEditLine: (line: number) => `Line ${line}`,
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
