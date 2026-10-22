import { fetchCategories } from '../../../lib/api.js';
import type { Category } from '../../../types/index.js';
import { exitWithError } from '../../../utils/action.js';
import { resolveEntryCategory } from '../category.js';
import type { ImportDocument, ImportTransaction } from './document.js';
import {
  automaticCandidates,
  emptyRun,
  failOnProblems,
  ids,
  label,
  pickTransactions,
  planConciliate,
  planImport,
  planReject,
  reference,
  type RunDocument,
} from './plan.js';

export const SELECTION_ACTIONS = ['import', 'skip', 'reject', 'conciliate'] as const;
export type SelectionAction = (typeof SELECTION_ACTIONS)[number];

/** One Bank Transaction chosen by hand (`--plan`, `--edit`): what to do with it and how. */
export interface SelectionItem {
  /** integrationId prefix or the whole UUID. */
  id: string;
  action: SelectionAction;
  /** Category ID, alias, or exact name. Required by `import`. */
  category?: string;
  /** Replaces the bank value on `import`. Only the sign may differ. */
  value?: number;
  /** Replaces the suggested description on `import`. */
  description?: string;
  /** The Entry to link on `conciliate`. Optional when exactly one candidate is automatic. */
  entry?: number;
}

/** The same refusal as `entries create` for an inactive category, plus no transfers and no unknown ids. */
export async function importCategory(input: string): Promise<Category> {
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

/** Each distinct category of the selection, by the identifier written in it. */
export async function selectionCategories(items: readonly SelectionItem[]): Promise<Map<string, Category>> {
  const categories = new Map<string, Category>();
  for (const item of items) {
    if (item.category !== undefined && !categories.has(item.category)) {
      categories.set(item.category, await importCategory(item.category));
    }
  }
  return categories;
}

/**
 * The run for a hand-made selection. Each item says its action, so an explicit `import`
 * of a duplicate is imported and nothing is linked unless the item says `conciliate`.
 * Any invalid item fails the whole batch before anything is printed or written.
 */
export function planSelection(
  document: ImportDocument,
  items: readonly SelectionItem[],
  options: { categories: ReadonlyMap<string, Category>; today: string; dryRun: boolean; source: string },
): RunDocument {
  const run = emptyRun(document, options.dryRun);
  const problems: string[] = [];
  const seen = new Map<ImportTransaction, string>();
  for (const item of items) {
    const [row] = pickTransactions(document.transactions, [item.id], options.source);
    const earlier = seen.get(row);
    if (earlier !== undefined) {
      problems.push(`${label(row)}: selected twice (${earlier} and ${item.id}).`);
      continue;
    }
    seen.set(row, item.id);
    const problem = planItem(row, item, options, run);
    if (problem !== null) problems.push(`${label(row)}: ${problem}`);
  }
  failOnProblems(problems);
  return run;
}

function planItem(
  row: ImportTransaction,
  item: SelectionItem,
  options: { categories: ReadonlyMap<string, Category>; today: string },
  run: RunDocument,
): string | null {
  switch (item.action) {
    case 'skip':
      run.skipped.push({ ...reference(row), reason: 'plan' });
      return null;
    case 'reject':
      return planReject(row, run);
    case 'conciliate':
      return planLink(row, item.entry, run);
    case 'import': {
      if (row.candidates.length > 0) {
        return `entries ${ids(row.candidates)} may already record it. Use conciliate, or skip it.`;
      }
      const category = item.category === undefined ? null : (options.categories.get(item.category) ?? null);
      return planImport(row, { category, today: options.today, value: item.value, description: item.description }, run);
    }
  }
}

function planLink(row: ImportTransaction, entryId: number | undefined, run: RunDocument): string | null {
  if (entryId !== undefined) {
    const entry = row.candidates.find((candidate) => candidate.id === entryId);
    if (entry === undefined) {
      const known = row.candidates.length === 0 ? 'it has no candidates' : `candidates: ${ids(row.candidates)}`;
      return `entry ${entryId} is not a candidate (${known}).`;
    }
    return planConciliate(row, entry, run);
  }
  if (row.candidates.length === 0) return 'no entry matches it, so there is nothing to link.';
  const automatic = automaticCandidates(row);
  if (automatic.length !== 1) {
    return `${row.candidates.length} entries may match it (${ids(row.candidates)}). Say which one with "entry".`;
  }
  return planConciliate(row, automatic[0], run);
}
