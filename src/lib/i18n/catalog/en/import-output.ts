import type { ptBREntriesImportOutput as SectionType } from '../pt-BR/import-output.js';

/** Import output, in English. */
export const enEntriesImportOutput: typeof SectionType = {
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
    `unknown key ${key} in the --plan file.`,
  errorPlanTransactionsMustBeList: () => '"transactions" must be a list.',
  errorPlanEmpty: () => '"transactions" is empty. There is no "import everything".',
  errorPlanIdMustBeString: () => '"id" must be a prefix or UUID string.',
  errorPlanActionOneOf: (actions) => `"action" must be one of ${actions}.`,
  errorPlanCategory: () =>
    '"category" must be a category ID, alias, or name.',
  errorPlanValue: () => '"value" must be a number.',
  errorPlanDescription: () => '"description" must be a string.',
  errorPlanEntry: () => '"entry" must be a numeric Entry id.',
  errorPlanEntryOnlyConciliate: () => '"entry" only applies to conciliate.',
  errorPlanAccount: () => '"account" must be an object with a numeric "id".',
  errorPlanAccountMismatch: (plan, run) =>
    `the plan is for account ${plan}, but the run is for account ${run}.`,
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
