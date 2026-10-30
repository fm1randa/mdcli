import { isCreditCard } from '../../../lib/api.js';
import { today } from '../../../lib/dates.js';
import type { Category } from '../../../types/index.js';
import { exitWithError } from '../../../utils/action.js';
import { t } from '../../../lib/i18n/index.js';
import { logger } from '../../../utils/logger.js';
import { promptConfirmation } from '../../../utils/prompt.js';
import { categoryCatalog } from '../category.js';
import { commitRun } from './commit.js';
import { applyOverwrite, readOverwrite } from './overwrite.js';
import { editRun } from './edit.js';
import { fillSuggestions, linkableOf, loadImport, nothingNewMessage, statementRows, type ImportLoadOptions, type LoadedImport } from './list.js';
import type { ImportDocument } from './document.js';
import { emptyRun, failOnProblems, pickBankTransactions, planRun, unmatchedPrefix, type RunDocument } from './plan.js';
import { readPlanFile } from './plan-file.js';
import { overwrittenNames, printRun } from './run-output.js';
import { importCategory, planSelection, selectionCategories } from './selection.js';

interface ImportRunOptions extends ImportLoadOptions {
  ids?: string;
  category?: string;
  reject?: string;
  plan?: string;
  edit?: boolean;
  includeDuplicates?: boolean;
  dryRun?: boolean;
  yes?: boolean;
  json?: boolean;
}

export async function runAction(options: ImportRunOptions): Promise<void> {
  if (options.json && !options.yes && !options.dryRun) {
    exitWithError(t('errorImportJsonRequires'));
  }
  const dryRun = options.dryRun === true;
  const planned = await plannedRun(options, today());
  if (planned === null) {
    if (!options.json) logger.info(t('importNothingToDo'));
    return;
  }
  const { run, loaded, categories } = planned;
  const { document, account, payload } = loaded;
  if (document.transactions.length === 0) {
    if (options.json) console.log(JSON.stringify(run, null, 2));
    else logger.info(t('importNothingNewWritten', nothingNewMessage(document)));
    return;
  }

  applyOverwrite(run, await readOverwrite(), { document, statementRows: statementRows(payload), existing: loaded.existing });
  const context = {
    accountName: document.account.name,
    categories,
    names: options.json ? null : await overwrittenNames(run),
  };
  // The web's commit marks every row of the statement it read, so a run that only leaves rows
  // alone (skip) still commits: markImported is how the web persists "Não importar".
  if (!options.json) printRun(run, context);
  if (!dryRun) {
    if (!options.yes && !options.json) {
      const confirmed = await promptConfirmation(t('confirmImport'));
      if (!confirmed) {
        logger.info(t('importCancelled'));
        // eslint-disable-next-line local/no-bare-process-exit
        process.exit(0);
      }
    }
    await commitRun({
      run,
      document,
      statementRows: statementRows(payload),
      creditCard: account !== undefined && isCreditCard(account),
      markImportedWindowDays: loaded.markImportedWindowDays,
    });
    if (!options.json) logger.success(t('importWritten', String(context.accountName ?? run.accountId)));
  }
  if (options.json) console.log(JSON.stringify(run, null, 2));
}

interface PlannedRun {
  run: RunDocument;
  loaded: LoadedImport;
  /** Every category the run imports with, for the summary table. */
  categories: Category[];
}

/** The run from one of the three ways to select: flags, --plan, or --edit. Null when --edit is cancelled. */
async function plannedRun(options: ImportRunOptions, today: string): Promise<PlannedRun | null> {
  if (options.plan !== undefined && options.edit) exitWithError(t('errorPlanDoesNotCombineWithEdit'));
  const source = options.plan !== undefined ? '--plan' : options.edit ? '--edit' : null;
  if (source === null) return fromFlags(options, today);
  // --include-duplicates is a common flag: with --edit it opens duplicates as import; in a --plan file each action rules.
  const conflicting = (['ids', 'category', 'reject'] as const).find(
    (key) => options[key] !== undefined,
  );
  if (conflicting !== undefined) {
    exitWithError(t('errorFlagDoesNotCombine', FLAG_NAMES[conflicting], source));
  }
  return options.plan === undefined ? fromEdit(options, today) : fromPlan(options, options.plan, today);
}

/** --ids with --category, and --reject. */
async function fromFlags(options: ImportRunOptions, today: string): Promise<PlannedRun> {
  if (options.category !== undefined && options.ids === undefined) {
    exitWithError(t('errorCategoryOnlyIds'));
  }
  if (options.ids !== undefined && options.category === undefined) {
    exitWithError(t('errorIdsNeedsCategory'));
  }
  if (options.ids === undefined && options.reject === undefined) {
    exitWithError(t('errorNothingSelected', listCommand(options)));
  }
  const ids = prefixList(options.ids, '--ids');
  const rejects = prefixList(options.reject, '--reject');
  const repeated = ids.find((id) => rejects.some((other) => other.toLowerCase() === id.toLowerCase()));
  if (repeated !== undefined) {
    exitWithError(t('errorPrefixInBoth', repeated));
  }

  const category = options.category === undefined ? null : await importCategory(options.category);
  const loaded = await loadImport(options);
  const { transactions: bankTransactions } = loaded.document;
  const problems: string[] = [];
  const picked = pickBankTransactions(bankTransactions, ids, '--ids', problems);
  const rejected = pickBankTransactions(bankTransactions, rejects, '--reject', problems);
  failOnProblems(withNothingNew(problems, loaded.document));
  const both = picked.find((row) => rejected.includes(row));
  if (both !== undefined) {
    exitWithError(t('errorSelectedByBoth', String(both.prefix ?? both.integrationId)));
  }
  const run = planRun(loaded.document, {
    toImport: picked,
    rejects: rejected,
    category,
    includeDuplicates: options.includeDuplicates === true,
    today,
    dryRun: options.dryRun === true,
  });
  return { run, loaded, categories: category === null ? [] : [category] };
}

/** --plan <file>: each item says its own action. The file is checked before any request. */
async function fromPlan(options: ImportRunOptions, path: string, today: string): Promise<PlannedRun> {
  const items = readPlanFile(path);
  const { categories, problems } = await selectionCategories(items);
  failOnProblems(problems);
  const loaded = await loadImport(options);
  if (loaded.document.transactions.length === 0) {
    failOnProblems(withNothingNew(items.map((item) => unmatchedPrefix(item.id, '--plan')), loaded.document));
  }
  const run = planSelection(loaded.document, items, {
    categories,
    today,
    dryRun: options.dryRun === true,
    source: '--plan',
    entryHint: () => t('importEntryHintPlan'),
    linkable: linkableOf(loaded),
  });
  return { run, loaded, categories: [...categories.values()] };
}

/** --edit: the same selection as --plan, written in $EDITOR over the statement with its suggestions. */
async function fromEdit(options: ImportRunOptions, today: string): Promise<PlannedRun | null> {
  const loaded = await loadImport(options);
  if (loaded.document.transactions.length === 0) return nothingNew(loaded, options);
  const catalog = categoryCatalog();
  await fillSuggestions(loaded, catalog);
  if (options.includeDuplicates) includeDuplicates(loaded.document);
  const edited = await editRun(loaded.document, {
    today,
    dryRun: options.dryRun === true,
    linkable: linkableOf(loaded),
    catalog,
  });
  return edited === null ? null : { ...edited, loaded };
}

/** No Bank Transaction to choose from: an empty run, so nothing is selected, prompted, or written. */
function nothingNew(loaded: LoadedImport, options: ImportRunOptions): PlannedRun {
  return { run: emptyRun(loaded.document, options.dryRun === true), loaded, categories: [] };
}

/** Prefixes that match nothing in an empty statement: say why it is empty and how to load more. */
function withNothingNew(problems: string[], document: ImportDocument): string[] {
  return problems.length > 0 && document.transactions.length === 0 ? [...problems, nothingNewMessage(document)] : problems;
}

/** `entries import list` for the same account and statement, as the user would type it. */
function listCommand(options: ImportRunOptions): string {
  const args = ['mdcli', 'entries', 'import', 'list', '-a', options.account];
  if (options.since !== undefined) args.push('--since', options.since);
  return args.map((arg) => (/^[\w./:@-]+$/.test(arg) ? arg : JSON.stringify(arg))).join(' ');
}

/** A duplicate the listing would skip opens as import (or without a category) instead. A linked one stays linked. */
function includeDuplicates(document: ImportDocument): void {
  for (const row of document.transactions) {
    if (row.duplicateOf === null || row.defaultAction !== 'skip') continue;
    row.defaultAction = row.suggestedCategory === null ? 'needs-category' : 'import';
  }
}

const FLAG_NAMES = {
  ids: '--ids',
  category: '--category',
  reject: '--reject',
} as const;

/** Comma-separated prefixes. An empty list is a typo, not an empty selection. */
function prefixList(input: string | undefined, flag: string): string[] {
  if (input === undefined) return [];
  const prefixes = input.split(',').map((part) => part.trim()).filter((part) => part !== '');
  if (prefixes.length === 0) {
    exitWithError(t('errorPrefixNeedsOne', flag));
  }
  return prefixes;
}
