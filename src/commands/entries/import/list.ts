import Table from 'cli-table3';
import chalk from 'chalk';
import { fetchAccountById, fetchBankTransactions, fetchCardInvoice, fetchImportCandidates, fetchImportDuplicates, isCreditCard } from '../../../lib/api.js';
import { isCalendarDate } from '../../../lib/dates.js';
import type { Account, Category } from '../../../types/index.js';
import { exitWithError } from '../../../utils/action.js';
import { formatCurrency } from '../../../utils/currency.js';
import { logger } from '../../../utils/logger.js';
import { categoryCatalog } from '../category.js';
import { fillAiCategories } from './ai.js';
import { automaticLinks, candidatesFor, readExisting, type ImportCandidate } from './candidates.js';
import { toImportDocument, type ImportDocument, type ImportTransaction, type SuggestedCategory } from './document.js';
import { aiRequest, duplicateId, loadedDateBounds } from './suggest.js';
import { resolveAccountOrExit } from '../../account-id.js';
import { accountConnection } from '../../connection.js';
import { asRecord } from '../../../lib/payload.js';
import { calendarDateFlag, explicitSince } from './since.js';

export interface ImportLoadOptions {
  account: string;
  since?: string;
  searchFrom?: string;
  searchTo?: string;
}

interface ImportListOptions extends ImportLoadOptions {
  json?: boolean;
}

export async function listAction(options: ImportListOptions): Promise<void> {
  const loaded = await loadImport(options);
  const { document } = loaded;
  await fillSuggestions(loaded);
  if (options.json) {
    console.log(JSON.stringify(document, null, 2));
    return;
  }
  printStatement(document);
}

export interface LoadedImport {
  document: ImportDocument;
  account: Account | undefined;
  /** The raw statement payload, row for row with `document.transactions`. */
  payload: unknown;
  /** Row for row, every Entry a plan may link: the candidates plus the Reconciled ones they hide. */
  linkable: ImportCandidate[][];
  /** The raw Entries (or invoice items) the candidates were read from. */
  candidateRows: unknown[];
}

/**
 * The statement with rule suggestions, duplicates, and candidates. Reads only (GET).
 * The AI suggestion is a separate step (`fillSuggestions`): `import run --ids` takes its category from --category.
 */
export async function loadImport(options: ImportLoadOptions): Promise<LoadedImport> {
  const searchFrom = calendarDateFlag(options.searchFrom);
  const searchTo = calendarDateFlag(options.searchTo);

  const now = new Date();
  const requested = explicitSince(options.since, now);
  const accountId = await resolveAccountOrExit(options.account);
  const link = await accountConnection(accountId);
  const { connectionAccount } = link;
  if (connectionAccount === null) {
    exitWithError(`Account ${accountId} is linked to connection ${link.connectionId}, which did not include its connection account id.`);
  }
  const account = await fetchAccountById(accountId);
  if (account !== undefined && isCreditCard(account) && (searchFrom !== undefined || searchTo !== undefined)) {
    exitWithError('A search window on a credit card is not specified. Candidates come from the invoice of proximoVencimento.');
  }
  // Like the web: the import badge shows the connection's summary (what the server has not seen imported);
  // the manual import dialog loads everything since a date, already imported or not.
  const payload: unknown = requested === undefined
    ? summaryStatement(link.summary)
    : await fetchBankTransactions(connectionAccount, requested);
  const document = toImportDocument({
    accountId,
    accountName: account?.nome ?? null,
    connectionId: link.connectionId,
    connectionAccount,
    source: requested === undefined ? 'summary' : 'statement',
    since: requested ?? null,
    payload,
  });
  if (searchFrom !== undefined) document.search.from = searchFrom;
  if (searchTo !== undefined) document.search.to = searchTo;
  // One flag alone can cross the default end the statement sets, so the window is checked once, here.
  const from = document.search.from;
  const to = document.search.to;
  if (from !== null && to !== null && from > to) {
    exitWithError(`Search start ${from} is after search end ${to}.`);
  }
  await fillDuplicates(document, accountId);
  const { linkable, rows: candidateRows } = await fillCandidates(document, account, payload);
  return { document, account, payload, linkable, candidateRows };
}

/** `LoadedImport.linkable` looked up by row, for `planSelection`. */
export function linkableOf(loaded: LoadedImport): (row: ImportTransaction) => readonly ImportCandidate[] {
  return (row) => loaded.linkable[loaded.document.transactions.indexOf(row)] ?? [];
}

/** The AI category for the rows the rules left without one, and every suggested category's name. */
export async function fillSuggestions(loaded: LoadedImport): Promise<void> {
  const catalog = categoryCatalog();
  const { document, payload } = loaded;
  await fillAiCategories(document, statementRows(payload).map(aiRequest), catalog);
  await fillCategoryNames(document, catalog);
}

/** `nome` from the Category catalog. An id the catalog does not have stays null. */
async function fillCategoryNames(document: ImportDocument, catalog: () => Promise<readonly Category[]>): Promise<void> {
  const pending: SuggestedCategory[] = [];
  for (const row of document.transactions) {
    if (row.suggestedCategory !== null) pending.push(row.suggestedCategory);
  }
  if (pending.length === 0) return;
  const items = await catalog();
  const names = new Map<number, string>();
  for (const item of items) names.set(item.id, item.nome);
  for (const category of pending) {
    category.name = names.get(category.id) ?? null;
  }
}

/** Same date and same value as an existing Entry. A duplicate is skipped, and the id stays visible. */
async function fillDuplicates(document: ImportDocument, accountId: number): Promise<void> {
  const bounds = loadedDateBounds(document.transactions.map((row) => row.date));
  if (bounds === null) return;
  const payload: unknown = await fetchImportDuplicates(accountId, bounds.start, bounds.end);
  for (const row of document.transactions) {
    const id = duplicateId(row.date, row.value, payload);
    row.duplicateOf = id;
    if (id !== null) row.defaultAction = 'skip';
  }
}

/**
 * Same value inside the search window, and the one Entry the web links on its own (`conciliateWith`).
 * A linked row conciliates, and that wins over a duplicate. Reconciled Entries stay out of
 * `candidates` unless linked, but a plan or the editor may still link one (`linkable`).
 */
async function fillCandidates(
  document: ImportDocument,
  account: Account | undefined,
  payload: unknown,
): Promise<{ linkable: ImportCandidate[][]; rows: unknown[] }> {
  const linkable = document.transactions.map((): ImportCandidate[] => []);
  if (document.transactions.length === 0) return { linkable, rows: [] };
  const from = document.search.from;
  const to = document.search.to;
  if (from === null || to === null) return { linkable, rows: [] };

  const card = account !== undefined && isCreditCard(account);
  const rows = card
    ? await invoiceRows(account)
    : await fetchImportCandidates(document.account.id, from, to);
  const existing = readExisting(rows, card ? 'invoice' : 'entry').filter(
    (item) => item.candidate.date >= from && item.candidate.date <= to,
  );
  const docs = documentNumbers(payload);
  const banks = document.transactions.map((row, index) => ({ date: row.date, value: row.value, ndocumento: docs[index] ?? null }));
  const linked = automaticLinks(banks, existing);
  document.transactions.forEach((transaction, index) => {
    const id = linked[index] ?? null;
    const matched = candidatesFor(banks[index], existing);
    transaction.candidates = matched
      .filter((item) => !item.reconciled || item.candidate.id === id)
      .map((item) => item.candidate);
    linkable[index] = matched.map((item) => item.candidate);
    transaction.conciliateWith = id;
    if (id !== null) transaction.defaultAction = 'conciliate';
  });
  return { linkable, rows };
}

async function invoiceRows(account: Account): Promise<unknown[]> {
  const due = invoiceDueDate(account);
  const invoice = await fetchCardInvoice(account.id, due);
  if (!Array.isArray(invoice.lancamentos)) {
    throw new Error(`GET /v1/cartoes/${account.id}/fatura/${due} did not return lancamentos`);
  }
  return invoice.lancamentos;
}

function invoiceDueDate(account: Account): string {
  const raw = account.proximoVencimento;
  if (typeof raw === 'string' && isCalendarDate(raw.slice(0, 10))) return raw.slice(0, 10);
  exitWithError(`Account ${account.id} has no proximoVencimento date to load an invoice from.`);
}

/** `{inicio, fim, saldo, lancamentos}` from the connection; no summary is an empty one (the web shows no badge). */
function summaryStatement(summary: unknown): unknown {
  return asRecord(summary) ?? { lancamentos: [] };
}

/** Why there is nothing to list or import, and how to load more. */
export function nothingNewMessage(document: ImportDocument): string {
  if (document.source === 'statement') return `No bank transactions since ${document.since ?? '-'}.`;
  const name = document.account.name ?? String(document.account.id);
  return `No new bank transactions for ${name}. ` +
    'To load the full statement from a date, like the web\'s manual import dialog, use --since <YYYY-MM-DD> (at most 90 days ago).';
}

export function statementRows(payload: unknown): unknown[] {
  const rows = asRecord(payload)?.lancamentos;
  return Array.isArray(rows) ? rows : [];
}

function documentNumbers(payload: unknown): (string | null)[] {
  return statementRows(payload).map((row) => {
    const value = asRecord(row)?.ndocumento;
    return typeof value === 'string' && value !== '' ? value : null;
  });
}

function printStatement(document: ImportDocument): void {
  if (document.transactions.length === 0) {
    logger.info(nothingNewMessage(document));
    return;
  }

  const table = new Table({
    head: [
      'Prefix',
      'Date',
      'Value',
      'Description',
      'Category',
      'Suggested description',
      'Tags',
      'Duplicate',
      'Candidates',
      'Action',
    ],
    style: { head: ['cyan'] },
  });
  for (const transaction of document.transactions) {
    table.push([
      cell(transaction.prefix),
      cell(transaction.date),
      transaction.value === null ? chalk.gray('-') : formatCurrency(transaction.value),
      cell(transaction.description),
      cell(categoryLabel(transaction.suggestedCategory)),
      cell(transaction.suggestedDescription),
      transaction.suggestedTagIds.length === 0 ? chalk.gray('-') : transaction.suggestedTagIds.join(', '),
      transaction.duplicateOf === null ? chalk.gray('-') : String(transaction.duplicateOf),
      transaction.candidates.length === 0
        ? chalk.gray('-')
        : transaction.candidates
          .map((item) => (item.id === transaction.conciliateWith ? `${item.id} (linked)` : String(item.id)))
          .join(', '),
      transaction.defaultAction,
    ]);
  }
  const { start, end } = document.statement;
  logger.header(
    document.source === 'summary'
      ? `New bank transactions (${document.transactions.length}), statement ${start ?? '-'} to ${end ?? '-'}`
      : `Bank transactions (${document.transactions.length}) since ${document.since ?? '-'}`,
  );
  console.log(table.toString());
  if (document.ai === 'unavailable') {
    logger.warning('AI category suggestions are unavailable. Only the learned rules were applied.');
  }
}

function categoryLabel(category: SuggestedCategory | null): string | null {
  if (category === null) return null;
  const label = category.name ?? String(category.id);
  return category.source === 'ai' ? `${label} (AI)` : label;
}

function cell(value: string | null): string {
  return value === null ? chalk.gray('-') : value;
}
