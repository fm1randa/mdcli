import type { Category } from '../../../types/index.js';
import { exitWithError } from '../../../utils/action.js';
import { categoryCatalog, checkEntryCategory } from '../category.js';
import type { ImportDocument, ImportTransaction } from './document.js';
import {
  automaticCandidates,
  checkWrittenValue,
  emptyRun,
  failOnProblems,
  ids,
  label,
  matchPrefix,
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
  /** The written value. Only the sign may differ from the bank; `import` writes it. */
  value?: number;
  /** Replaces the suggested description on `import`. */
  description?: string;
  /** The Entry to link on `conciliate`. Optional when exactly one candidate is automatic. */
  entry?: number;
}

/**
 * The same refusal as `entries create` for an inactive category, plus no transfers and no unknown ids.
 * The catalog is read once for every category of the run.
 */
async function checkImportCategory(
  input: string,
  catalog: () => Promise<readonly Category[]>,
): Promise<Category | { error: string }> {
  const checked = await checkEntryCategory(input, catalog);
  if ('error' in checked) return checked;
  const category = (await catalog()).find((item) => item.id === checked.id);
  if (category === undefined) {
    return { error: `Unknown category: ${input}. See available categories with: mdcli categories list --active` };
  }
  if (category.tipo === 't') {
    return { error: `Category "${category.nome}" (${category.id}) is a transfer category. Import does not create transfers.` };
  }
  return category;
}

/** `checkImportCategory` for --ids: exits on the first refusal. */
export async function importCategory(input: string): Promise<Category> {
  const checked = await checkImportCategory(input, categoryCatalog());
  if ('error' in checked) exitWithError(checked.error);
  return checked;
}

/**
 * Each distinct category of the selection, by the identifier written in it, and one
 * problem per item whose category is refused. Items with a refused category are left out of `categories`.
 */
export async function selectionCategories(
  items: readonly SelectionItem[],
): Promise<{ categories: Map<string, Category>; problems: string[] }> {
  const categories = new Map<string, Category>();
  const refused = new Map<string, string>();
  const problems: string[] = [];
  const catalog = categoryCatalog();
  for (const item of items) {
    const input = item.category;
    if (input === undefined) continue;
    if (!categories.has(input) && !refused.has(input)) {
      const checked = await checkImportCategory(input, catalog);
      if ('error' in checked) refused.set(input, checked.error);
      else categories.set(input, checked);
    }
    const error = refused.get(input);
    if (error !== undefined) problems.push(`${item.id}: ${error}`);
  }
  return { categories, problems };
}

/**
 * The run for a hand-made selection (`--plan` and `--edit` both end here). Each item says its
 * action, so an explicit `import` of a duplicate is imported and nothing is linked unless the
 * item says `conciliate`. Any invalid item fails the whole batch with a `PlanError` listing
 * every problem, before anything is printed or written.
 */
export function planSelection(
  document: ImportDocument,
  items: readonly SelectionItem[],
  options: SelectionOptions & { dryRun: boolean; source: string },
): RunDocument {
  const run = emptyRun(document, options.dryRun);
  const problems: string[] = [];
  const seen = new Map<ImportTransaction, string>();
  for (const item of items) {
    const row = matchPrefix(document.transactions, item.id, options.source);
    if (typeof row === 'string') {
      problems.push(row);
      continue;
    }
    const earlier = seen.get(row);
    if (earlier !== undefined) {
      problems.push(`${label(row)}: selected twice (${earlier} and ${item.id}).`);
      continue;
    }
    seen.set(row, item.id);
    const problem = checkWrittenValue(row, item.value) ?? planItem(row, item, options, run);
    if (problem !== null) problems.push(`${label(row)}: ${problem}`);
  }
  failOnProblems(problems);
  return run;
}

interface SelectionOptions {
  categories: ReadonlyMap<string, Category>;
  today: string;
  /** How to name the Entry when `conciliate` has no single automatic candidate, in the source's syntax. */
  entryHint: (prefix: string) => string;
}

function planItem(row: ImportTransaction, item: SelectionItem, options: SelectionOptions, run: RunDocument): string | null {
  switch (item.action) {
    case 'skip':
      run.skipped.push({ ...reference(row), reason: 'plan' });
      return null;
    case 'reject':
      return planReject(row, run);
    case 'conciliate':
      return planLink(row, item.entry, options.entryHint, run);
    case 'import': {
      // Only an automatic candidate (within two days) already records it; a farther one is linked by hand or not at all.
      const automatic = automaticCandidates(row);
      if (automatic.length > 0) {
        return `entries ${ids(automatic)} may already record it. Use conciliate, or skip it.`;
      }
      const category = item.category === undefined ? null : (options.categories.get(item.category) ?? null);
      return planImport(row, { category, today: options.today, value: item.value, description: item.description }, run);
    }
  }
}

function planLink(
  row: ImportTransaction,
  entryId: number | undefined,
  entryHint: (prefix: string) => string,
  run: RunDocument,
): string | null {
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
    const count = row.candidates.length;
    return `${count} ${count === 1 ? 'entry' : 'entries'} may match it (${ids(row.candidates)}). ${entryHint(label(row))}`;
  }
  return planConciliate(row, automatic[0], run);
}
