import { isCalendarDate } from '../../../lib/dates.js';
import type { Category } from '../../../types/index.js';
import { withinTwoDays, type ImportCandidate } from './candidates.js';
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
  const run = emptyRun(document, selection.dryRun);
  const problems: string[] = [];
  for (const row of selection.ids) {
    const problem = planSelected(row, selection, run);
    if (problem !== null) problems.push(`${label(row)}: ${problem}`);
  }
  for (const row of selection.rejects) {
    const problem = planReject(row, run);
    if (problem !== null) problems.push(`${label(row)}: ${problem}`);
  }
  failOnProblems(problems);
  return run;
}

/** A run with nothing in it yet. Overwrite preferences are not read: the web default applies. */
export function emptyRun(document: ImportDocument, dryRun: boolean): RunDocument {
  return {
    dryRun,
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
}

/** The batch is invalid. `problems` has one line per item, each starting with its prefix. */
export class PlanError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Nothing was imported. Fix the selection:\n${problems.join('\n')}`);
  }
}

/** One message for the whole batch, so every problem is fixed in one pass. */
export function failOnProblems(problems: readonly string[]): void {
  if (problems.length > 0) throw new PlanError(problems);
}

/** A written value may only flip the sign of the bank value. */
export function checkWrittenValue(row: ImportTransaction, value: number | undefined): string | null {
  if (value === undefined || row.value === null) return null;
  if (Math.round(Math.abs(value) * 100) === Math.round(Math.abs(row.value) * 100)) return null;
  return `value ${value} is not the bank value ${row.value}. Only the sign can change.`;
}

export function planReject(row: ImportTransaction, run: RunDocument): string | null {
  // The commit dates each page by its latest bank date, rejects included.
  if (row.date === null || !isCalendarDate(row.date)) return 'the bank did not send a date.';
  run.rejected.push(reference(row));
  return null;
}

/** Candidates within two days of the bank date: the ones the web links by itself. */
export function automaticCandidates(row: ImportTransaction): ImportCandidate[] {
  return row.candidates.filter(
    (candidate) => row.date !== null && isCalendarDate(row.date) && withinTwoDays(row.date, candidate.date),
  );
}

/** Links the row to `entry`, keeping the Entry's value and description (overwrite is off). */
export function planConciliate(row: ImportTransaction, entry: ImportCandidate, run: RunDocument): string | null {
  if (row.date === null || !isCalendarDate(row.date)) return 'the bank did not send a date.';
  if (row.value === 0) return 'the value is zero.';
  const kept = { value: entry.value, description: entry.description };
  run.conciliated.push({ ...reference(row), entryId: entry.id, before: kept, after: { ...kept } });
  return null;
}

/** Adds the item to `run`, or returns why it cannot be part of the batch. */
function planSelected(row: ImportTransaction, selection: RunSelection, run: RunDocument): string | null {
  const automatic = automaticCandidates(row);
  if (automatic.length > 1) {
    return `${automatic.length} entries match it (${ids(automatic)}). --ids cannot choose which one to link.`;
  }
  if (automatic.length === 1) return planConciliate(row, automatic[0], run);
  if (row.candidates.length > 0) {
    return `entries ${ids(row.candidates)} may already record it. Importing would create a second Entry.`;
  }
  if (row.duplicateOf !== null && !selection.includeDuplicates) {
    run.skipped.push({ ...reference(row), reason: 'duplicate' });
    return null;
  }
  return planImport(row, { category: selection.category, today: selection.today }, run);
}

export interface ImportChoice {
  category: Category | null;
  /** Local calendar day. On or before it is Reconciled; after it, Scheduled. */
  today: string;
  /** Replaces the bank value. Only the sign may differ (`checkWrittenValue`). */
  value?: number;
  /** Replaces the suggested description. */
  description?: string;
}

/** Adds a new Entry for the row to `run`, or returns why it cannot be created. */
export function planImport(row: ImportTransaction, choice: ImportChoice, run: RunDocument): string | null {
  const category = choice.category;
  if (category === null) return 'it has no category.';
  const { date } = row;
  if (date === null || !isCalendarDate(date)) return 'the bank did not send a date.';
  if (row.value === null) return 'the bank did not send a value.';
  if (row.value === 0) return 'the value is zero.';
  const value = choice.value ?? row.value;
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
    description: choice.description ?? row.suggestedDescription ?? row.description,
    categoryId: category.id,
    tagIds: row.suggestedTagIds,
    status: date <= choice.today ? 'reconciled' : 'scheduled',
  });
  return null;
}

export function reference(row: ImportTransaction): RunReference {
  const integrationId = row.integrationId ?? '';
  return { integrationId, prefix: row.prefix ?? integrationId };
}

export function label(row: ImportTransaction): string {
  return row.prefix ?? row.integrationId ?? '?';
}

export function ids(candidates: readonly { id: number }[]): string {
  return candidates.map((candidate) => candidate.id).join(', ');
}
