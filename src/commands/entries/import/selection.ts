import type { Category } from '../../../types/index.js';
import { exitWithError } from '../../../utils/action.js';
import { t } from '../../../lib/i18n/index.js';
import { isPositiveSafeInteger, parseId } from '../../../utils/parse.js';
import { categoryCatalog, checkEntryCategory, type CategoryCatalog } from '../category.js';
import type { ImportCandidate } from './candidates.js';
import type { ImportDocument, BankTransactionRow } from './document.js';
import {
  checkWrittenValue,
  emptyRun,
  failOnProblems,
  formatIds,
  label,
  linkedCandidate,
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
  /** The Entry to link on `conciliate`. Optional when the row has an automatically linked Entry. */
  entry?: number;
}

/** An Entry id read for `conciliate`, or why it is not one: the caller has to handle both. */
type EntryIdRead = { entry: number } | { error: string };

/**
 * The Entry id a `--plan` (JSON number) or `--edit` (digits) file names for `conciliate`.
 * Both files check it here, so 0 or an id past 2^53 is refused instead of read as "no entry".
 */
export function readEntryId(input: number | string): EntryIdRead {
  const entry = typeof input === 'number' ? (isPositiveSafeInteger(input) ? input : undefined) : parseId(input);
  if (entry !== undefined) return { entry };
  return { error: t('errorEntryIdNotEntry', input) };
}

/**
 * The same refusal as `entries create` for an inactive category, plus no transfers and no unknown ids.
 * The catalog is read once for every category of the run.
 */
async function checkImportCategory(
  input: string,
  catalog: CategoryCatalog,
): Promise<Category | { error: string }> {
  const checked = await checkEntryCategory(input, catalog);
  if ('error' in checked) return checked;
  const category = (await catalog()).find((item) => item.id === checked.id);
  if (category === undefined) {
    return { error: t('errorUnknownCategoryForEntry', input) };
  }
  if (category.tipo === 't') {
    return { error: t('errorImportTransferCategory', category.nome, category.id) };
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
  catalog: CategoryCatalog = categoryCatalog(),
): Promise<{ categories: Map<string, Category>; problems: string[] }> {
  const categories = new Map<string, Category>();
  const refused = new Map<string, string>();
  const problems: string[] = [];
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
  const seen = new Map<BankTransactionRow, string>();
  for (const item of items) {
    const row = matchPrefix(document.transactions, item.id, options.source);
    if (typeof row === 'string') {
      problems.push(row);
      continue;
    }
    const earlier = seen.get(row);
    if (earlier !== undefined) {
      problems.push(t('errorSelectedTwice', label(row), earlier, item.id));
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
  /** How to name the Entry when `conciliate` has no automatically linked one, in the source's syntax. */
  entryHint: (prefix: string) => string;
  /** Every Entry `conciliate` may name for the row: its candidates and the Reconciled ones they hide. */
  linkable: (row: BankTransactionRow) => readonly ImportCandidate[];
}

function planItem(row: BankTransactionRow, item: SelectionItem, options: SelectionOptions, run: RunDocument): string | null {
  switch (item.action) {
    case 'skip':
      run.skipped.push({ ...reference(row), reason: 'plan' });
      return null;
    case 'reject':
      return planReject(row, run);
    case 'conciliate':
      return planLink(row, item.entry, options, run);
    case 'import': {
      // Only the automatically linked Entry already records it; another candidate is linked by hand or not at all.
      const linked = linkedCandidate(row);
      if (linked !== null) {
        return t('errorEntryAlreadyRecords', linked.id);
      }
      const category = item.category === undefined ? null : (options.categories.get(item.category) ?? null);
      return planImport(row, { category, today: options.today, value: item.value, description: item.description }, run);
    }
  }
}

function planLink(
  row: BankTransactionRow,
  entryId: number | undefined,
  options: SelectionOptions,
  run: RunDocument,
): string | null {
  if (entryId !== undefined) {
    // Like the web with "carregar conciliados": a Reconciled Entry hidden from the candidates may be named.
    const entry = options.linkable(row).find((candidate) => candidate.id === entryId);
    if (entry === undefined) {
      const known = row.candidates.length === 0
        ? t('importNoCandidates')
        : t('importCandidatesList', formatIds(row.candidates));
      return t('errorEntryNotCandidate', entryId, known);
    }
    return planConciliate(row, entry, run);
  }
  const linked = linkedCandidate(row);
  if (linked !== null) return planConciliate(row, linked, run);
  if (row.candidates.length === 0) return t('errorNoEntryMatches');
  const count = row.candidates.length;
  return t('errorEntriesMayMatch', count, formatIds(row.candidates), options.entryHint(label(row)));
}
