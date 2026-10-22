import { isCalendarDate } from '../../../lib/dates.js';
import type { Category } from '../../../types/index.js';
import { withinTwoDays } from './candidates.js';
import type { ImportDocument, ImportTransaction } from './document.js';

interface RunReference {
  integrationId: string;
  prefix: string;
}

interface ImportedItem extends RunReference {
  date: string;
  value: number;
  description: string | null;
  categoryId: number;
  tagIds: number[];
  status: 'reconciled' | 'scheduled';
}

interface ValueAndDescription {
  value: number;
  description: string | null;
}

interface ConciliatedItem extends RunReference {
  entryId: number;
  before: ValueAndDescription;
  after: ValueAndDescription;
}

/** What `entries import run` would write (dry run) or wrote. */
export interface RunDocument {
  dryRun: boolean;
  accountId: number;
  connectionAccount: number;
  statement: ImportDocument['statement'];
  overwrite: { value: boolean; description: boolean; source: 'default' };
  imported: ImportedItem[];
  conciliated: ConciliatedItem[];
  rejected: RunReference[];
  skipped: (RunReference & { reason: 'duplicate' | 'plan' })[];
  markImportedError: string | null;
}

export interface RunSelection {
  /** Bank Transactions picked with --ids. They get `category`. */
  ids: ImportTransaction[];
  /** Bank Transactions picked with --reject. */
  rejects: ImportTransaction[];
  category: Category | null;
  includeDuplicates: boolean;
  /** Local calendar day. On or before it is Reconciled; after it, Scheduled. */
  today: string;
  dryRun: boolean;
}

/**
 * Each selected prefix to the one Bank Transaction whose integrationId starts with it, ignoring case.
 * A prefix that matches none, or more than one, fails the whole run.
 */
export function pickTransactions(
  transactions: readonly ImportTransaction[],
  prefixes: readonly string[],
  flag: string,
): ImportTransaction[] {
  const picked: ImportTransaction[] = [];
  for (const prefix of prefixes) {
    const head = prefix.toLowerCase();
    const matches = transactions.filter((row) => row.integrationId?.toLowerCase().startsWith(head) === true);
    if (matches.length === 0) {
      throw new Error(`${flag} ${prefix} does not match any bank transaction.`);
    }
    if (matches.length > 1) {
      throw new Error(`${flag} ${prefix} matches ${matches.length} bank transactions. Use a longer prefix.`);
    }
    if (!picked.includes(matches[0])) picked.push(matches[0]);
  }
  return picked;
}

/**
 * Decide the action for each selected Bank Transaction and validate the whole batch.
 * Any invalid item throws, listing every problem, before anything is printed or written.
 */
export function planRun(document: ImportDocument, selection: RunSelection): RunDocument {
  const run: RunDocument = {
    dryRun: selection.dryRun,
    accountId: document.account.id,
    connectionAccount: document.connection.connectionAccount,
    statement: document.statement,
    overwrite: { value: false, description: false, source: 'default' },
    imported: [],
    conciliated: [],
    rejected: [],
    skipped: [],
    markImportedError: null,
  };
  const problems: string[] = [];
  for (const row of selection.ids) {
    const problem = planSelected(row, selection, run);
    if (problem !== null) problems.push(`${label(row)}: ${problem}`);
  }
  for (const row of selection.rejects) {
    // The commit dates each page by its latest bank date, rejects included.
    if (row.date === null || !isCalendarDate(row.date)) problems.push(`${label(row)}: the bank did not send a date.`);
    else run.rejected.push(reference(row));
  }
  if (problems.length > 0) {
    throw new Error(`Nothing was imported. Fix the selection:\n${problems.join('\n')}`);
  }
  return run;
}

/** Adds the item to `run`, or returns why it cannot be part of the batch. */
function planSelected(row: ImportTransaction, selection: RunSelection, run: RunDocument): string | null {
  const automatic = row.candidates.filter(
    (candidate) => row.date !== null && isCalendarDate(row.date) && withinTwoDays(row.date, candidate.date),
  );
  if (automatic.length > 1) {
    return `${automatic.length} entries match it (${ids(automatic)}). --ids cannot choose which one to link.`;
  }
  if (automatic.length === 1) {
    const entry = automatic[0];
    if (row.value === 0) return 'the value is zero.';
    const kept = { value: entry.value, description: entry.description };
    run.conciliated.push({ ...reference(row), entryId: entry.id, before: kept, after: { ...kept } });
    return null;
  }
  if (row.candidates.length > 0) {
    return `entries ${ids(row.candidates)} may already record it. Importing would create a second Entry.`;
  }
  if (row.duplicateOf !== null && !selection.includeDuplicates) {
    run.skipped.push({ ...reference(row), reason: 'duplicate' });
    return null;
  }
  return planImport(row, selection, run);
}

function planImport(row: ImportTransaction, selection: RunSelection, run: RunDocument): string | null {
  const category = selection.category;
  if (category === null) return 'it has no category.';
  const { date, value } = row;
  if (date === null || !isCalendarDate(date)) return 'the bank did not send a date.';
  if (value === null) return 'the bank did not send a value.';
  if (value === 0) return 'the value is zero.';
  if (category.tipo === 'd' && value > 0) {
    return `category "${category.nome}" is an expense, so the value must be negative.`;
  }
  if (category.tipo === 'r' && value < 0) {
    return `category "${category.nome}" is income, so the value must be positive.`;
  }
  if (category.tipo === 't') return `category "${category.nome}" is a transfer.`;
  run.imported.push({
    ...reference(row),
    date,
    value,
    description: row.suggestedDescription ?? row.description,
    categoryId: category.id,
    tagIds: row.suggestedTagIds,
    status: date <= selection.today ? 'reconciled' : 'scheduled',
  });
  return null;
}

function reference(row: ImportTransaction): RunReference {
  const integrationId = row.integrationId ?? '';
  return { integrationId, prefix: row.prefix ?? integrationId };
}

function label(row: ImportTransaction): string {
  return row.prefix ?? row.integrationId ?? '?';
}

function ids(candidates: readonly { id: number }[]): string {
  return candidates.map((candidate) => candidate.id).join(', ');
}
