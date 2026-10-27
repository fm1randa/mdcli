import { isCalendarDate } from '../../../lib/dates.js';
import type { Category } from '../../../types/index.js';
import { toCents } from '../../../utils/currency.js';
import { t } from '../../../lib/i18n/index.js';
import type { ImportCandidate, OverwrittenFields } from './candidates.js';
import type { ImportDocument, BankTransactionRow } from './document.js';

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

/** A linked Entry's side. With `sobrescrever` on (`applyOverwrite`), also the fields it replaces. */
type LinkedSide = { value: number; description: string | null } & Partial<OverwrittenFields>;

interface ConciliatedItem extends RunReference {
  entryId: number;
  /** Set only with `sobrescrever` on: a reconciled Entry keeps its fields. */
  reconciled?: boolean;
  before: LinkedSide;
  after: LinkedSide;
}

/** What `entries import run` would write (dry run) or wrote. */
export interface RunDocument {
  dryRun: boolean;
  accountId: number;
  connectionAccount: number;
  statement: ImportDocument['statement'];
  /** The web's `conciliacao` preference: `value` is `s` (sobrescrever), `description` is `sd`. */
  overwrite: { value: boolean; description: boolean; source: 'preferences' | 'default' };
  imported: ImportedItem[];
  conciliated: ConciliatedItem[];
  rejected: RunReference[];
  skipped: (RunReference & { reason: 'duplicate' | 'plan' })[];
  markImportedError: string | null;
}

export interface RunSelection {
  /** Bank Transactions picked with --ids. They get `category`. */
  toImport: BankTransactionRow[];
  /** Bank Transactions picked with --reject. */
  rejects: BankTransactionRow[];
  category: Category | null;
  includeDuplicates: boolean;
  /** Local calendar day. On or before it is Reconciled; after it, Scheduled. */
  today: string;
  dryRun: boolean;
}

/**
 * Each selected prefix to the one Bank Transaction whose integrationId starts with it, ignoring case.
 * A prefix that matches none, or more than one, is added to `problems`: it fails the whole run.
 */
export function pickBankTransactions(
  bankTransactions: readonly BankTransactionRow[],
  prefixes: readonly string[],
  flag: string,
  problems: string[],
): BankTransactionRow[] {
  const picked: BankTransactionRow[] = [];
  for (const prefix of prefixes) {
    const match = matchPrefix(bankTransactions, prefix, flag);
    if (typeof match === 'string') problems.push(match);
    else if (!picked.includes(match)) picked.push(match);
  }
  return picked;
}

export function unmatchedPrefix(prefix: string, flag: string): string {
  return t('importPrefixNoMatch', flag, prefix);
}

/** The one Bank Transaction whose integrationId starts with `prefix` (ignoring case), or why there is not one. */
export function matchPrefix(
  bankTransactions: readonly BankTransactionRow[],
  prefix: string,
  flag: string,
): BankTransactionRow | string {
  const head = prefix.toLowerCase();
  const matches = bankTransactions.filter((row) => row.integrationId?.toLowerCase().startsWith(head) === true);
  if (matches.length === 0) return unmatchedPrefix(prefix, flag);
  if (matches.length > 1) return t('importPrefixManyMatches', flag, prefix, matches.length);
  return matches[0];
}

/**
 * Decide the action for each selected Bank Transaction and validate the whole batch.
 * Any invalid item throws, listing every problem, before anything is printed or written.
 */
export function planRun(document: ImportDocument, selection: RunSelection): RunDocument {
  const run = emptyRun(document, selection.dryRun);
  const problems: string[] = [];
  for (const row of selection.toImport) {
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

/** A run with nothing in it yet, with the web default overwrite until `applyOverwrite` reads the preference. */
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
    super(t('errorNothingImported', problems.join('\n')));
  }
}

/** One message for the whole batch, so every problem is fixed in one pass. */
export function failOnProblems(problems: readonly string[]): void {
  if (problems.length > 0) throw new PlanError(problems);
}

const noBankDate = (): string => t('importNoBankDate');
const zeroValue = (): string => t('importZeroValue');

/** The row's bank date when it is a calendar day; otherwise null. */
function bankDate(row: BankTransactionRow): string | null {
  return row.date !== null && isCalendarDate(row.date) ? row.date : null;
}

/** A written value may only flip the sign of the bank value. */
export function checkWrittenValue(row: BankTransactionRow, value: number | undefined): string | null {
  if (value === undefined || row.value === null) return null;
  if (toCents(value) === toCents(row.value)) return null;
  return t('errorWrittenValue', value, row.value);
}

export function planReject(row: BankTransactionRow, run: RunDocument): string | null {
  // The commit dates each page by its latest bank date, rejects included.
  if (bankDate(row) === null) return noBankDate();
  run.rejected.push(reference(row));
  return null;
}

/** The candidate the web linked on its own, or null. */
export function linkedCandidate(row: BankTransactionRow): ImportCandidate | null {
  return row.candidates.find((candidate) => candidate.id === row.conciliateWith) ?? null;
}

/** Links the row to `entry`. `after` keeps the Entry's value and description until `applyOverwrite`. */
export function planConciliate(row: BankTransactionRow, entry: ImportCandidate, run: RunDocument): string | null {
  if (bankDate(row) === null) return noBankDate();
  if (row.value === 0) return zeroValue();
  const kept = { value: entry.value, description: entry.description };
  run.conciliated.push({ ...reference(row), entryId: entry.id, before: kept, after: { ...kept } });
  return null;
}

/** Adds the item to `run`, or returns why it cannot be part of the batch. */
function planSelected(row: BankTransactionRow, selection: RunSelection, run: RunDocument): string | null {
  const linked = linkedCandidate(row);
  if (linked !== null) return planConciliate(row, linked, run);
  // An unlinked candidate is only a hint: it is linked by hand (conciliate with its id), never blocks import.
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
export function planImport(row: BankTransactionRow, choice: ImportChoice, run: RunDocument): string | null {
  const category = choice.category;
  if (category === null) return t('importNoCategory');
  const date = bankDate(row);
  if (date === null) return noBankDate();
  if (row.value === null) return t('importNoBankValue');
  if (row.value === 0) return zeroValue();
  const value = choice.value ?? row.value;
  if (category.tipo === 'd' && value > 0) {
    return t('errorCategoryExpenseNegative', category.nome);
  }
  if (category.tipo === 'r' && value < 0) {
    return t('errorCategoryIncomePositive', category.nome);
  }
  if (category.tipo === 't') return t('errorCategoryIsTransfer', category.nome);
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

export function reference(row: BankTransactionRow): RunReference {
  const integrationId = row.integrationId ?? '';
  return { integrationId, prefix: row.prefix ?? integrationId };
}

export function label(row: BankTransactionRow): string {
  return row.prefix ?? row.integrationId ?? '?';
}

export function formatIds(candidates: readonly { id: number }[]): string {
  return candidates.map((candidate) => candidate.id).join(', ');
}
