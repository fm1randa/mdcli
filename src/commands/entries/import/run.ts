import { fetchCategories } from '../../../lib/api.js';
import { toLocalDateString } from '../../../lib/dates.js';
import type { Category } from '../../../types/index.js';
import { exitWithError } from '../../../utils/action.js';
import { resolveEntryCategory } from '../category.js';
import { loadImport, type ImportLoadOptions } from './list.js';
import { pickTransactions, planRun } from './plan.js';
import { printRun } from './run-output.js';

interface ImportRunOptions extends ImportLoadOptions {
  ids?: string;
  category?: string;
  reject?: string;
  includeDuplicates?: boolean;
  dryRun?: boolean;
  yes?: boolean;
  json?: boolean;
}

export async function runAction(options: ImportRunOptions): Promise<void> {
  if (options.json && !options.yes && !options.dryRun) {
    exitWithError('entries import run --json requires --yes or --dry-run');
  }
  if (options.category !== undefined && options.ids === undefined) {
    exitWithError('--category only applies to --ids.');
  }
  if (options.ids !== undefined && options.category === undefined) {
    exitWithError('--ids needs -c, --category: every Entry the import creates has a category.');
  }
  if (options.ids === undefined && options.reject === undefined) {
    exitWithError('Nothing selected. Use --ids with --category, or --reject. There is no "import everything".');
  }
  const ids = prefixList(options.ids, '--ids');
  const rejects = prefixList(options.reject, '--reject');
  const repeated = ids.find((id) => rejects.some((other) => other.toLowerCase() === id.toLowerCase()));
  if (repeated !== undefined) {
    exitWithError(`${repeated} is in both --ids and --reject.`);
  }

  const category = options.category === undefined ? null : await importCategory(options.category);
  const { document } = await loadImport(options);
  const picked = pickTransactions(document.transactions, ids, '--ids');
  const rejected = pickTransactions(document.transactions, rejects, '--reject');
  const both = picked.find((row) => rejected.includes(row));
  if (both !== undefined) {
    exitWithError(`${both.prefix ?? both.integrationId} is selected by both --ids and --reject.`);
  }

  const run = planRun(document, {
    ids: picked,
    rejects: rejected,
    category,
    includeDuplicates: options.includeDuplicates === true,
    today: toLocalDateString(new Date()),
    dryRun: options.dryRun === true,
  });
  if (!options.dryRun) {
    exitWithError('Writing an import is not available yet. Run again with --dry-run to see what it would do.');
  }

  if (options.json) {
    console.log(JSON.stringify(run, null, 2));
    return;
  }
  printRun(run, { accountName: document.account.name, category });
}

/** Comma-separated prefixes. An empty list is a typo, not an empty selection. */
function prefixList(input: string | undefined, flag: string): string[] {
  if (input === undefined) return [];
  const prefixes = input.split(',').map((part) => part.trim()).filter((part) => part !== '');
  if (prefixes.length === 0) {
    exitWithError(`${flag} needs at least one prefix.`);
  }
  return prefixes;
}

/** The same refusal as `entries create` for an inactive category, plus no transfers and no unknown ids. */
async function importCategory(input: string): Promise<Category> {
  const id = await resolveEntryCategory(input);
  const { items } = await fetchCategories();
  const category = items.find((item) => item.id === id);
  if (category === undefined) {
    exitWithError(`Unknown category: ${input}. See available categories with: mdcli categories list --active`);
  }
  if (category.tipo === 't') {
    exitWithError(`Category "${category.nome}" (${category.id}) is a transfer category. Import does not create transfers.`);
  }
  return category;
}
