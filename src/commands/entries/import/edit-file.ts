import { parseAmount, parseId } from '../../../utils/parse.js';
import type { ImportDocument, ImportTransaction } from './document.js';
import { matchPrefix } from './plan.js';
import { SELECTION_ACTIONS, type SelectionItem } from './selection.js';

const ERROR_MARK = '# error: ';

/** The --edit file: one command line per Bank Transaction, candidates as comments above it, help below. */
export function renderEditFile(document: ImportDocument): string {
  const out: string[] = [];
  const unusable: string[] = [];
  for (const row of document.transactions) {
    if (row.prefix === null || row.date === null || row.value === null) {
      unusable.push(row.prefix ?? row.integrationId ?? '?');
      continue;
    }
    if (row.candidates.length > 0) {
      out.push(`# candidates ${row.prefix}`);
      for (const candidate of row.candidates) {
        const description = candidate.description === null ? '' : ` ${candidate.description}`;
        out.push(`# ${candidate.id} ${candidate.date} ${amount(candidate.value)}${description}`);
      }
    }
    const category = row.suggestedCategory === null ? '' : (row.suggestedCategory.name ?? String(row.suggestedCategory.id));
    const description = row.suggestedDescription ?? row.description ?? '';
    out.push(`${defaultCommand(row)} ${row.date} ${amount(row.value)} ${category} | ${description}`);
  }
  if (unusable.length > 0) out.push('', `# Left out (no id, date or value from the bank): ${unusable.join(', ')}`);
  const name = document.account.name ?? String(document.account.id);
  out.push(
    '',
    `# Import for ${name}, statement ${document.statement.start ?? '-'} to ${document.statement.end ?? '-'}.`,
    '# Commands:',
    '#   import <prefix> <date> <value> <category> | <description>   create an Entry',
    '#   conciliate <prefix> [<entryId>] <date> <value> <category> | <description>   link an existing Entry',
    '#     Reconciled Entries are not listed as candidates, but their id may still be written here.',
    '#   skip <prefix> ...     leave it for later',
    '#   reject <prefix> ...   mark it as not imported',
    '# The date and the absolute value must be the bank ones; flipping the sign is allowed.',
    '# Lines starting with # are comments. Remove every command line to cancel.',
  );
  return `${out.join('\n')}\n`;
}

/** The command, the prefix and, on conciliate, the automatically linked Entry. */
function defaultCommand(row: ImportTransaction): string {
  const prefix = row.prefix ?? '';
  if (row.defaultAction === 'conciliate' && row.conciliateWith !== null) return `conciliate ${prefix} ${row.conciliateWith}`;
  return `${row.defaultAction === 'needs-category' ? 'import' : row.defaultAction} ${prefix}`;
}

function amount(value: number): string {
  return value.toFixed(2);
}

/** `# error:` lines on top of the file, replacing the ones from the previous round. */
export function withErrors(text: string, errors: readonly string[]): string {
  const kept = text.split('\n').filter((line) => !line.startsWith(ERROR_MARK));
  const marks = errors.flatMap((error) => error.split('\n')).map((line) => `${ERROR_MARK}${line}`);
  return [...marks, ...kept].join('\n');
}

const PIPE = / \|(?: |$)/;
const LINE = /^(\S+)\s+(\S+)(?:\s+(\d+))?\s+(\S+)\s+(\S+)(?:\s+(.*?))?\s*$/;

/**
 * The command lines as a selection (the same one `--plan` makes), or every syntax problem found.
 * Comments and blank lines are skipped. The rules shared with `--plan` (value, category, candidates)
 * are checked later by `planSelection`; here only what the line format adds: the bank date.
 */
export function parseEditFile(
  text: string,
  transactions: readonly ImportTransaction[],
): { items: SelectionItem[]; errors: string[] } {
  const items: SelectionItem[] = [];
  const errors: string[] = [];
  const seen = new Set<ImportTransaction>();
  text.split('\n').forEach((raw, index) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;
    const parsed = parseLine(line, `Line ${index + 1}`, transactions);
    if (typeof parsed === 'string') {
      errors.push(parsed);
    } else if (seen.has(parsed.row)) {
      errors.push(`${parsed.item.id}: it has more than one command line.`);
    } else {
      seen.add(parsed.row);
      items.push(parsed.item);
    }
  });
  return { items, errors };
}

function parseLine(
  line: string,
  where: string,
  transactions: readonly ImportTransaction[],
): { row: ImportTransaction; item: SelectionItem } | string {
  // The line is trimmed, so an empty description leaves the pipe last: "... |".
  const pipe = PIPE.exec(line);
  const head = pipe === null ? line : line.slice(0, pipe.index);
  const description = pipe === null ? '' : line.slice(pipe.index + pipe[0].length).trim();
  const match = LINE.exec(head);
  if (match === null || pipe === null) {
    return `${where}: expected "<command> <prefix> <date> <value> <category> | <description>".`;
  }
  const [, command, prefix, entryText, date, valueText, categoryText = ''] = match;
  const action = SELECTION_ACTIONS.find((name) => name === command);
  if (action === undefined) return `${where}: unknown command "${command}". Use ${SELECTION_ACTIONS.join(', ')}.`;
  const row = matchPrefix(transactions, prefix, `${where}: prefix`);
  if (typeof row === 'string') return row;
  const id = row.prefix ?? prefix;
  if (entryText !== undefined && action !== 'conciliate') return `${id}: only conciliate takes an entry id.`;
  if (date !== row.date) return `${id}: the date must be the bank date ${row.date ?? '-'}.`;
  const value = parseAmount(valueText);
  if (value === undefined) return `${id}: the value ${valueText} is not a number.`;
  const item: SelectionItem = { id, action, value };
  if (action === 'import') {
    // Empty: the suggested description, then the bank text (planImport).
    if (description !== '') item.description = description;
    const category = categoryText.trim();
    if (category !== '') item.category = category;
  }
  if (action === 'conciliate' && entryText !== undefined) item.entry = parseId(entryText);
  return { row, item };
}
