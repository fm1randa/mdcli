import { isCreditCard } from '../../../lib/api.js';
import { toLocalDateString } from '../../../lib/dates.js';
import type { Category } from '../../../types/index.js';
import { exitWithError } from '../../../utils/action.js';
import { logger } from '../../../utils/logger.js';
import { promptConfirmation } from '../../../utils/prompt.js';
import { commitRun } from './commit.js';
import { loadImport, statementRows, type ImportLoadOptions, type LoadedImport } from './list.js';
import { pickTransactions, planRun, type RunDocument } from './plan.js';
import { readPlanFile } from './plan-file.js';
import { printRun } from './run-output.js';
import { importCategory, planSelection, selectionCategories } from './selection.js';

interface ImportRunOptions extends ImportLoadOptions {
  ids?: string;
  category?: string;
  reject?: string;
  plan?: string;
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
  const planned = options.plan === undefined ? await fromFlags(options, today) : await fromPlan(options, options.plan, today);
  const { run, loaded, categories } = planned;
  const { document, account, payload, candidateRows } = loaded;

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

/** --ids with --category, and --reject. */
async function fromFlags(options: ImportRunOptions, today: string): Promise<PlannedRun> {
  if (options.category !== undefined && options.ids === undefined) {
    exitWithError('--category only applies to --ids.');
  }
  if (options.ids !== undefined && options.category === undefined) {
    exitWithError('--ids needs -c, --category: every Entry the import creates has a category.');
  }
  if (options.ids === undefined && options.reject === undefined) {
    exitWithError('Nothing selected. Use --ids with --category, --reject, or --plan. There is no "import everything".');
  }
  const ids = prefixList(options.ids, '--ids');
  const rejects = prefixList(options.reject, '--reject');
  const repeated = ids.find((id) => rejects.some((other) => other.toLowerCase() === id.toLowerCase()));
  if (repeated !== undefined) {
    exitWithError(`${repeated} is in both --ids and --reject.`);
  }

  const category = options.category === undefined ? null : await importCategory(options.category);
  const loaded = await loadImport(options);
  const { transactions } = loaded.document;
  const picked = pickTransactions(transactions, ids, '--ids');
  const rejected = pickTransactions(transactions, rejects, '--reject');
  const both = picked.find((row) => rejected.includes(row));
  if (both !== undefined) {
    exitWithError(`${both.prefix ?? both.integrationId} is selected by both --ids and --reject.`);
  }
  const run = planRun(loaded.document, {
    ids: picked,
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
  const conflicting = (['ids', 'category', 'reject', 'includeDuplicates'] as const).find(
    (key) => options[key] !== undefined,
  );
  if (conflicting !== undefined) {
    exitWithError(`${FLAG_NAMES[conflicting]} does not combine with --plan. Put every choice in the plan file.`);
  }
  const items = readPlanFile(path);
  const categories = await selectionCategories(items);
  const loaded = await loadImport(options);
  const run = planSelection(loaded.document, items, {
    categories,
    today,
    dryRun: options.dryRun === true,
    source: '--plan',
  });
  return { run, loaded, categories: [...categories.values()] };
}

const FLAG_NAMES = {
  ids: '--ids',
  category: '--category',
  reject: '--reject',
  includeDuplicates: '--include-duplicates',
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
