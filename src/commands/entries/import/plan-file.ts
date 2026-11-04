import { readFileSync } from 'node:fs';
import { asRecord } from '../../../lib/payload.js';
import { t } from '../../../lib/i18n/index.js';
import { isPositiveSafeInteger } from '../../../utils/parse.js';
import {
  SELECTION_ACTIONS,
  type ImportSelectionDocument,
  type ImportSelectionItem,
  type SelectionAction,
} from './document.js';
import { readEntryId } from './selection.js';

/**
 * The keys a plan item carries. The selection keys are what the run reads; the diagnostic keys come
 * from `import list --json`, so its output is already a valid `--plan` file. Anything else fails.
 */
const SELECTION_KEYS = new Set(['id', 'action', 'category', 'value', 'description', 'entry']);
const DIAGNOSTIC_KEYS = new Set([
  'integrationId',
  'date',
  'bankDescription',
  'suggestedDescription',
  'suggestedTagIds',
  'suggestedCategory',
  'duplicateOf',
  'alreadyConciliated',
  'candidates',
]);
const ITEM_KEYS = new Set([...SELECTION_KEYS, ...DIAGNOSTIC_KEYS]);
/** `import list --json` writes the whole document; a hand-written plan only needs `transactions`. */
const DOCUMENT_KEYS = new Set([
  'account',
  'connection',
  'source',
  'since',
  'statement',
  'search',
  'ai',
  'transactions',
]);

/**
 * Reads a `--plan` file: UTF-8 JSON `{ "transactions": [ ... ] }`, or the whole document
 * `import list --json` writes. An unknown key, an unknown action, or a wrong type fails the whole
 * file, listing every problem, before any request.
 */
export function readPlanFile(path: string): ImportSelectionDocument {
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
  const extra = Object.keys(plan).filter((key) => !DOCUMENT_KEYS.has(key));
  if (extra.length > 0) throw invalid([t('errorPlanUnknownKey', quote(extra[0]))]);
  const rows = plan.transactions;
  if (!Array.isArray(rows)) throw invalid([t('errorPlanTransactionsMustBeList')]);
  if (rows.length === 0) throw invalid([t('errorPlanEmpty')]);

  const problems: string[] = [];
  const items: ImportSelectionItem[] = [];
  rows.forEach((row: unknown, index) => {
    const where = `transactions[${index}]`;
    const item = readItem(row, (problem) => problems.push(`${where}: ${problem}`));
    if (item !== null) items.push(item);
  });
  if (problems.length > 0) throw invalid(problems);
  return { transactions: items };
}

function readItem(input: unknown, report: (problem: string) => void): ImportSelectionItem | null {
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
    if (!ITEM_KEYS.has(key)) counted(`unknown key ${quote(key)}.`);
  }
  const { id, action } = row;
  if (typeof id !== 'string' || id.trim() === '') counted(t('errorPlanIdMustBeString'));
  if (typeof action !== 'string' || !isAction(action)) {
    counted(t('errorPlanActionOneOf', SELECTION_ACTIONS.join(', ')));
    return null;
  }
  const item: ImportSelectionItem = {
    id: typeof id === 'string' ? id.trim() : null,
    action,
    category: readCategory(row.category, counted),
    value: readValue(row.value, counted),
    description: readDescription(row.description, counted),
    entry: readEntry(row.entry, counted),
  };
  if (action === 'import' && item.category === null) counted(t('errorPlanCategoryRequired'));
  return failed ? null : item;
}

function readCategory(input: unknown, report: (problem: string) => void): string | null {
  if (input === undefined || input === null) return null;
  if (typeof input === 'string' && input.trim() !== '') return input.trim();
  if (isPositiveSafeInteger(input)) return String(input);
  report(t('errorPlanCategory'));
  return null;
}

function readValue(input: unknown, report: (problem: string) => void): number | null {
  if (input === undefined || input === null) return null;
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  report(t('errorPlanValue'));
  return null;
}

function readDescription(input: unknown, report: (problem: string) => void): string | null {
  if (input === undefined || input === null) return null;
  if (typeof input === 'string') return input;
  report(t('errorPlanDescription'));
  return null;
}

function readEntry(input: unknown, report: (problem: string) => void): number | null {
  if (input === undefined || input === null) return null;
  const read = typeof input === 'number' ? readEntryId(input) : null;
  if (read === null) {
    report(t('errorPlanEntry'));
    return null;
  }
  if ('error' in read) {
    report(read.error);
    return null;
  }
  return read.entry;
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
