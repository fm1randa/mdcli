import { readFileSync } from 'node:fs';
import { asRecord } from '../../../lib/payload.js';
import { t } from '../../../lib/i18n/index.js';
import { isPositiveSafeInteger } from '../../../utils/parse.js';
import { readEntryId, SELECTION_ACTIONS, type SelectionAction, type SelectionItem } from './selection.js';

/** Keys each action accepts besides `id` and `action`. Anything else fails the file. */
const ACTION_KEYS: Record<SelectionAction, readonly string[]> = {
  import: ['category', 'value', 'description'],
  conciliate: ['entry'],
  reject: [],
  skip: [],
};
const ALL_KEYS = new Set(['id', 'action', 'category', 'value', 'description', 'entry']);

/**
 * Reads a `--plan` file: UTF-8 JSON `{ "transactions": [ ... ] }`. An unknown key, an unknown
 * action, or a wrong type fails the whole file, listing every problem, before any request.
 */
export function readPlanFile(path: string): SelectionItem[] {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    throw new Error(t('errorCannotReadPlanFile', path, errorMessage(error)), { cause: error });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(t('errorPlanInvalidJson', errorMessage(error)), { cause: error });
  }
  const plan = asRecord(parsed);
  if (plan === null) throw invalid([t('errorPlanNotObject')]);
  const extra = Object.keys(plan).filter((key) => key !== 'transactions');
  if (extra.length > 0) throw invalid([t('errorPlanUnknownKey', quote(extra[0]))]);
  const rows = plan.transactions;
  if (!Array.isArray(rows)) throw invalid([t('errorPlanTransactionsMustBeList')]);
  if (rows.length === 0) throw invalid([t('errorPlanEmpty')]);

  const problems: string[] = [];
  const items: SelectionItem[] = [];
  rows.forEach((row: unknown, index) => {
    const where = `transactions[${index}]`;
    const item = readItem(row, (problem) => problems.push(`${where}: ${problem}`));
    if (item !== null) items.push(item);
  });
  if (problems.length > 0) throw invalid(problems);
  return items;
}

function readItem(input: unknown, report: (problem: string) => void): SelectionItem | null {
  const row = asRecord(input);
  if (row === null) {
    report('must be an object.');
    return null;
  }
  let failed = false;
  const counted = (problem: string) => {
    failed = true;
    report(problem);
  };
  for (const key of Object.keys(row)) {
    if (!ALL_KEYS.has(key)) counted(`unknown key ${quote(key)}.`);
  }
  const { id, action } = row;
  if (typeof id !== 'string' || id.trim() === '') counted(t('errorPlanIdMustBeString'));
  if (typeof action !== 'string' || !isAction(action)) {
    counted(t('errorPlanActionOneOf', SELECTION_ACTIONS.join(', ')));
    return null;
  }
  for (const key of ['category', 'value', 'description', 'entry']) {
    if (key in row && !ACTION_KEYS[action].includes(key)) counted(t('errorPlanKeyNotApplicable', quote(key), action));
  }
  const item: SelectionItem = { id: typeof id === 'string' ? id.trim() : '', action };
  const { category, value, description, entry } = row;
  if (category !== undefined) {
    if (typeof category === 'string' && category.trim() !== '') item.category = category.trim();
    else if (isPositiveSafeInteger(category)) item.category = String(category);
    else counted(t('errorPlanCategory'));
  }
  if (value !== undefined) {
    if (typeof value === 'number' && Number.isFinite(value)) item.value = value;
    else counted(t('errorPlanValue'));
  }
  if (description !== undefined) {
    if (typeof description === 'string') item.description = description;
    else counted(t('errorPlanDescription'));
  }
  if (entry !== undefined) {
    const read = typeof entry === 'number' ? readEntryId(entry) : null;
    if (read === null) counted(t('errorPlanEntry'));
    else if ('error' in read) counted(read.error);
    else item.entry = read.entry;
  }
  if (action === 'import' && category === undefined) counted(t('errorPlanCategoryRequired'));
  return failed ? null : item;
}

function invalid(problems: readonly string[]): Error {
  return new Error(t('errorInvalidPlanFile', problems.join('\n')));
}

function isAction(value: string): value is SelectionAction {
  return (SELECTION_ACTIONS as readonly string[]).includes(value);
}

function quote(key: string): string {
  return JSON.stringify(key);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : t('unknownError');
}
