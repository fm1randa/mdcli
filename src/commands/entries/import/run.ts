import { isCreditCard } from '../../../lib/api.js';
import { toLocalDateString } from '../../../lib/dates.js';
import type { Category } from '../../../types/index.js';
import { exitWithError } from '../../../utils/action.js';
import { logger } from '../../../utils/logger.js';
import { promptConfirmation } from '../../../utils/prompt.js';
import { categoryCatalog } from '../category.js';
import { commitRun } from './commit.js';
import { editRun } from './edit.js';
import { fillSuggestions, linkableOf, loadImport, nothingNewMessage, statementRows, type ImportLoadOptions, type LoadedImport } from './list.js';
import type { ImportDocument } from './document.js';
import { emptyRun, failOnProblems, pickBankTransactions, planRun, type RunDocument } from './plan.js';
import { readPlanFile } from './plan-file.js';
import { printRun } from './run-output.js';
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
    exitWithError('entries import run --json requires --yes or --dry-run');
  }
  const today = toLocalDateString(new Date());
  const dryRun = options.dryRun === true;
  const planned = await plannedRun(options, today);
  if (planned === null) {
    if (!options.json) logger.info('Nothing to do: the file has no command lines. Nothing was written.');
    return;
  }
  const { run, loaded, categories } = planned;
  const { document, account, payload, candidateRows } = loaded;
  if (document.transactions.length === 0) {
    if (options.json) console.log(JSON.stringify(run, null, 2));
    else logger.info(`${nothingNewMessage(document)} Nothing was written.`);
    return;
  }

  const context = { accountName: document.account.name, categories };
  const writes = run.imported.length + run.conciliated.length + run.rejected.length;
  if (!options.json) printRun(run, context);
  if (!dryRun && writes === 0) {
    if (!options.json) logger.info('Nothing to write: every selected bank transaction is skipped.');
  } else if (!dryRun) {
    if (!options.yes && !options.json) {
      const confirmed = await promptConfirmation(`Write this import to Meu Dinheiro? (y/N) `);
      if (!confirmed) {
        logger.info('Import cancelled. Nothing was written.');
        process.exit(0);
      }
    }
    await commitRun({
      run,
      document,
      statementRows: statementRows(payload),
      candidateRows,
      creditCard: account !== undefined && isCreditCard(account),
    });
    if (!options.json) logger.success(`Import written for ${context.accountName ?? run.accountId}.`);
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
  if (options.plan !== undefined && options.edit) exitWithError('--plan does not combine with --edit.');
  const source = options.plan !== undefined ? '--plan' : options.edit ? '--edit' : null;
  if (source === null) return fromFlags(options, today);
  // --include-duplicates is a common flag: with --edit it opens duplicates as import; in a --plan file each action rules.
  const conflicting = (['ids', 'category', 'reject'] as const).find(
    (key) => options[key] !== undefined,
  );
  if (conflicting !== undefined) {
    exitWithError(`${FLAG_NAMES[conflicting]} does not combine with ${source}. Every choice goes in the ${source} file.`);
  }
  return options.plan === undefined ? fromEdit(options, today) : fromPlan(options, options.plan, today);
}

/** --ids with --category, and --reject. */
async function fromFlags(options: ImportRunOptions, today: string): Promise<PlannedRun> {
  if (options.category !== undefined && options.ids === undefined) {
    exitWithError('--category only applies to --ids.');
  }
  if (options.ids !== undefined && options.category === undefined) {
    exitWithError('--ids needs -c, --category: every Entry the import creates has a category.');
  }
  if (options.ids === undefined && options.reject === undefined) {
    exitWithError('Nothing selected. Use --ids with --category, --reject, --plan, or --edit. There is no "import everything".');
  }
  const ids = prefixList(options.ids, '--ids');
  const rejects = prefixList(options.reject, '--reject');
  const repeated = ids.find((id) => rejects.some((other) => other.toLowerCase() === id.toLowerCase()));
  if (repeated !== undefined) {
    exitWithError(`${repeated} is in both --ids and --reject.`);
  }

  const category = options.category === undefined ? null : await importCategory(options.category);
  const loaded = await loadImport(options);
  if (loaded.document.transactions.length === 0) return nothingNew(loaded, options);
  const { transactions: bankTransactions } = loaded.document;
  const picked = pickBankTransactions(bankTransactions, ids, '--ids');
  const rejected = pickBankTransactions(bankTransactions, rejects, '--reject');
  const both = picked.find((row) => rejected.includes(row));
  if (both !== undefined) {
    exitWithError(`${both.prefix ?? both.integrationId} is selected by both --ids and --reject.`);
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
  if (loaded.document.transactions.length === 0) return nothingNew(loaded, options);
  const run = planSelection(loaded.document, items, {
    categories,
    today,
    dryRun: options.dryRun === true,
    source: '--plan',
    entryHint: () => 'Say which one with "entry".',
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
    exitWithError(`${flag} needs at least one prefix.`);
  }
  return prefixes;
}
