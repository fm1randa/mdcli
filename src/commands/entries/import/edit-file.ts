import { sameName } from '../../../lib/name-cache.js';
import { t } from '../../../lib/i18n/index.js';
import type { Category } from '../../../types/index.js';
import { parseAmount } from '../../../utils/parse.js';
import {
  SELECTION_ACTIONS,
  type ImportDocument,
  type ImportSelectionItem,
  type BankTransactionRow,
} from './document.js';
import { matchPrefix } from './plan.js';
import { readEntryId } from './selection.js';

const ERROR_MARK = '# error: ';

/**
 * The --edit file: one command line per Bank Transaction, candidates as comments above it, help below.
 * `categories` is the catalog: a suggested category whose name another category shares is written by id.
 */
export function renderEditFile(document: ImportDocument, categories: readonly Category[]): string {
  const out: string[] = [];
  const unusable: string[] = [];
  for (const row of document.transactions) {
    if (row.id === null || row.date === null || row.value === null) {
      unusable.push(row.id ?? row.integrationId ?? '?');
      continue;
    }
    if (row.candidates.length > 0) {
      out.push(t('importEditCandidates', row.id));
      for (const candidate of row.candidates) {
        const description = candidate.description === null ? '' : ` ${candidate.description}`;
        out.push(`# ${candidate.id} ${candidate.date} ${amount(candidate.value)}${description}`);
      }
    }
    const category = suggestedCategoryText(row, categories);
    const description = row.description ?? '';
    out.push(`${defaultCommand(row)} ${row.date} ${amount(row.value)} ${category} | ${description}`);
  }
  if (unusable.length > 0) out.push('', t('importEditLeftOut', unusable.join(', ')));
  const name = document.account.name ?? String(document.account.id);
  out.push(
    '',
    t('importEditImportFor', name, document.statement.start ?? '-', document.statement.end ?? '-'),
    t('importEditCommandsHeader'),
    t('importEditImportCommand'),
    t('importEditConciliateCommand'),
    t('importEditReconciledNote'),
    t('importEditSkipCommand'),
    t('importEditRejectCommand'),
    t('importEditDateValueNote'),
    t('importEditCommentsNote'),
  );
  return `${out.join('\n')}\n`;
}

/** The suggested category's name, or its id when there is no name or the name is not unique. */
function suggestedCategoryText(row: BankTransactionRow, categories: readonly Category[]): string {
  const suggested = row.suggestedCategory;
  if (suggested === null) return '';
  const name = suggested.name;
  if (name === null) return String(suggested.id);
  const same = categories.filter((category) => sameName(category.nome, name));
  return same.length > 1 ? String(suggested.id) : name;
}

/** The command, the id and, on conciliate, the automatically linked Entry. */
function defaultCommand(row: BankTransactionRow): string {
  const id = row.id ?? '';
  if (row.action === 'conciliate' && row.entry !== null) return `conciliate ${id} ${row.entry}`;
  return `${row.action} ${id}`;
}

/**
 * The suggested category's id when the line still names it: a name lookup could land on
 * another category with the same name, or on a stale name cache.
 */
function keptSuggestion(row: BankTransactionRow, category: string): string | null {
  const suggested = row.suggestedCategory;
  if (suggested === null || suggested.name === null) return null;
  return sameName(suggested.name, category) ? String(suggested.id) : null;
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
  bankTransactions: readonly BankTransactionRow[],
): { items: ImportSelectionItem[]; errors: string[] } {
  const items: ImportSelectionItem[] = [];
  const errors: string[] = [];
  const seen = new Set<BankTransactionRow>();
  text.split('\n').forEach((raw, index) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;
    const parsed = parseLine(line, index + 1, bankTransactions);
    if (typeof parsed === 'string') {
      errors.push(parsed);
    } else if (seen.has(parsed.row)) {
      errors.push(t('importEditMoreThanOneLine', parsed.item.id ?? ''));
    } else {
      seen.add(parsed.row);
      items.push(parsed.item);
    }
  });
  return { items, errors };
}

function parseLine(
  line: string,
  lineNumber: number,
  bankTransactions: readonly BankTransactionRow[],
): { row: BankTransactionRow; item: ImportSelectionItem } | string {
  const where = t('importEditLine', lineNumber);
  // The line is trimmed, so an empty description leaves the pipe last: "... |".
  const pipe = PIPE.exec(line);
  const head = pipe === null ? line : line.slice(0, pipe.index);
  const description = pipe === null ? '' : line.slice(pipe.index + pipe[0].length).trim();
  const match = LINE.exec(head);
  if (match === null || pipe === null) {
    return t('importEditExpectedLine', where);
  }
  const [, command, prefix, entryText, date, valueText, categoryText = ''] = match;
  const action = SELECTION_ACTIONS.find((name) => name === command);
  if (action === undefined) return t('importEditUnknownCommand', where, command, SELECTION_ACTIONS.join(', '));
  const row = matchPrefix(bankTransactions, prefix, t('importEditPrefixFlag', where));
  if (typeof row === 'string') return row;
  const id = row.id ?? prefix;
  if (entryText !== undefined && action !== 'conciliate') return t('importEditOnlyConciliateEntryId', id);
  if (date !== row.date) return t('importEditDateMustBeBankDate', id, row.date ?? '-');
  const value = parseAmount(valueText);
  if (value === undefined) return t('importEditValueNotNumber', id, valueText);
  const item: ImportSelectionItem = {
    id,
    action,
    category: null,
    value,
    description: null,
    entry: null,
  };
  if (action === 'import') {
    // Empty: the suggested description, then the bank text (planImport).
    if (description !== '') item.description = description;
    const category = categoryText.trim();
    if (category !== '') item.category = keptSuggestion(row, category) ?? category;
  }
  if (action === 'conciliate' && entryText !== undefined) {
    const read = readEntryId(entryText);
    if ('error' in read) return `${id}: ${read.error}`;
    item.entry = read.entry;
  }
  return { row, item };
}
