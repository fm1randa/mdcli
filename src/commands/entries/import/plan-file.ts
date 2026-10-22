import { readFileSync } from 'node:fs';
import { SELECTION_ACTIONS, type SelectionAction, type SelectionItem } from './selection.js';

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
    throw new Error(`Cannot read the --plan file ${path}: ${error instanceof Error ? error.message : 'unknown error'}`, { cause: error });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`The --plan file is not valid JSON: ${error instanceof Error ? error.message : 'unknown error'}`, { cause: error });
  }
  if (!isRecord(parsed)) throw invalid(['the file must be a JSON object with "transactions".']);
  const extra = Object.keys(parsed).filter((key) => key !== 'transactions');
  if (extra.length > 0) throw invalid([`unknown key ${quote(extra[0])} (the file only has "transactions").`]);
  const rows = parsed.transactions;
  if (!Array.isArray(rows)) throw invalid(['"transactions" must be a list.']);
  if (rows.length === 0) throw invalid(['"transactions" is empty. There is no "import everything".']);

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

function readItem(row: unknown, report: (problem: string) => void): SelectionItem | null {
  if (!isRecord(row)) {
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
  if (typeof id !== 'string' || id.trim() === '') counted('"id" must be a prefix or UUID string.');
  if (typeof action !== 'string' || !isAction(action)) {
    counted(`"action" must be one of ${SELECTION_ACTIONS.join(', ')}.`);
    return null;
  }
  for (const key of ['category', 'value', 'description', 'entry']) {
    if (key in row && !ACTION_KEYS[action].includes(key)) counted(`${quote(key)} does not apply to ${action}.`);
  }
  const item: SelectionItem = { id: typeof id === 'string' ? id.trim() : '', action };
  const { category, value, description, entry } = row;
  if (category !== undefined) {
    if (typeof category === 'string' && category.trim() !== '') item.category = category.trim();
    else if (isPositiveInteger(category)) item.category = String(category);
    else counted('"category" must be a category ID, alias, or name.');
  }
  if (value !== undefined) {
    if (typeof value === 'number' && Number.isFinite(value)) item.value = value;
    else counted('"value" must be a number.');
  }
  if (description !== undefined) {
    if (typeof description === 'string') item.description = description;
    else counted('"description" must be a string.');
  }
  if (entry !== undefined) {
    if (isPositiveInteger(entry)) item.entry = entry;
    else counted('"entry" must be a numeric Entry id.');
  }
  if (action === 'import' && category === undefined) counted('"category" is required for import.');
  return failed ? null : item;
}

function invalid(problems: readonly string[]): Error {
  return new Error(`Invalid --plan file. Nothing was imported.\n${problems.join('\n')}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAction(value: string): value is SelectionAction {
  return (SELECTION_ACTIONS as readonly string[]).includes(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function quote(key: string): string {
  return JSON.stringify(key);
}
