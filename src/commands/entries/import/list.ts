import Table from 'cli-table3';
import chalk from 'chalk';
import { fetchAccountById, fetchBankTransactions, fetchCardInvoice, fetchImportCandidates, fetchImportDuplicates, isCreditCard } from '../../../lib/api.js';
import type { Account } from '../../../types/index.js';
import { exitWithError } from '../../../utils/action.js';
import { ownDueDate } from '../card-invoice.js';
import { formatCurrency } from '../../../utils/currency.js';
import { logger } from '../../../utils/logger.js';
import { cell } from '../../../utils/text.js';
import { categoryCatalog, type CategoryCatalog } from '../category.js';
import { fillAiCategories } from './ai.js';
import { automaticLinks, candidatesFor, readExisting, type ExistingEntry, type ImportCandidate } from './candidates.js';
import { toImportDocument, type ImportDocument, type BankTransactionRow, type SuggestedCategory } from './document.js';
import { aiRequest, duplicateId, loadedDateBounds } from './suggest.js';
import { resolveAccountOrExit } from '../../account-id.js';
import { accountConnection } from '../../connection.js';
import { asRecord, nonEmptyTextOrNull } from '../../../lib/payload.js';
import { calendarDateFlag, defaultSince, earliestSince, explicitSince } from './since.js';
import { today } from '../../../lib/dates.js';

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
  /** Every Entry the run may link, by id, with the fields `sobrescrever` replaces. */
  existing: ReadonlyMap<number, ExistingEntry>;
}

/**
 * The statement with rule suggestions, duplicates, and candidates. Reads only (GET).
 * The AI suggestion is a separate step (`fillSuggestions`): `import run --ids` takes its category from --category.
 */
export async function loadImport(options: ImportLoadOptions): Promise<LoadedImport> {
  const searchFrom = calendarDateFlag(options.searchFrom);
  const searchTo = calendarDateFlag(options.searchTo);

  const day = today();
  const requested = explicitSince(options.since, day);
  const accountId = await resolveAccountOrExit(options.account);
  const link = await accountConnection(accountId);
  const { connectionAccount } = link;
  if (connectionAccount === null) {
    exitWithError(`Account ${accountId} is linked to connection ${link.connectionId}, which did not include its connection account id.`);
  }
  const account = await fetchAccountById(accountId);
  const card = account !== undefined && isCreditCard(account);
  if (card && (searchFrom !== undefined || searchTo !== undefined)) {
    exitWithError('A search window on a credit card is not specified. Candidates come from the current card invoice.');
  }
  // Like the web: the import badge shows the connection's summary (what the server has not seen imported),
  // but a GET rarely has one (the web gets it from the sync PUT, which the CLI never sends on its own).
  // Without it, load what the web's import button loads: everything since a date, already imported or not.
  const summary = requested === undefined ? summaryStatement(link.summary) : null;
  const since = summary === null ? (requested ?? defaultSince(account?.dataUltimoExtrato, day)) : null;
  const payload: unknown = since === null ? summary : await fetchBankTransactions(connectionAccount, since);
  const document = toImportDocument({
    accountId,
    accountName: account?.nome ?? null,
    connectionId: link.connectionId,
    connectionAccount,
    source: since === null ? 'summary' : 'statement',
    since,
    payload,
  });
  // A card searches its whole invoice, not a window: `search` must not announce one.
  if (card) document.search = { from: null, to: null };
  if (searchFrom !== undefined) document.search.from = searchFrom;
  if (searchTo !== undefined) document.search.to = searchTo;
  // One flag alone can cross the default end the statement sets, so the window is checked once, here.
  const from = document.search.from;
  const to = document.search.to;
  if (from !== null && to !== null && from > to) {
    exitWithError(`Search start ${from} is after search end ${to}.`);
  }
  await fillDuplicates(document, accountId);
  const { linkable, existing } = await fillCandidates(document, account, payload);
  return { document, account, payload, linkable, existing };
}

/** `LoadedImport.linkable` looked up by row, for `planSelection`. */
export function linkableOf(loaded: LoadedImport): (row: BankTransactionRow) => readonly ImportCandidate[] {
  return (row) => loaded.linkable[loaded.document.transactions.indexOf(row)] ?? [];
}

/** The AI category for the rows the rules left without one, and every suggested category's name. */
export async function fillSuggestions(
  loaded: LoadedImport,
  catalog: CategoryCatalog = categoryCatalog(),
): Promise<void> {
  const { document, payload } = loaded;
  await fillAiCategories(document, statementRows(payload).map(aiRequest), catalog);
  await fillCategoryNames(document, catalog);
}

/** `nome` from the Category catalog. An id the catalog does not have stays null. */
async function fillCategoryNames(document: ImportDocument, catalog: CategoryCatalog): Promise<void> {
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
 * Same value inside the search window (a card: anywhere in its invoice), and the one Entry the web
 * links on its own (`conciliateWith`). A linked row conciliates, and that wins over a duplicate. Reconciled Entries stay out of
 * `candidates` unless linked, but a plan or the editor may still link one (`linkable`).
 */
async function fillCandidates(
  document: ImportDocument,
  account: Account | undefined,
  payload: unknown,
): Promise<Pick<LoadedImport, 'linkable' | 'existing'>> {
  const linkable = document.transactions.map((): ImportCandidate[] => []);
  if (document.transactions.length === 0) return { linkable, existing: new Map() };
  const card = account !== undefined && isCreditCard(account);
  const rows = card ? await invoiceRows(account) : await windowRows(document);
  const { from, to } = document.search;
  const existing = readExisting(rows, card ? 'invoice' : 'entry').filter(
    (item) => card || (from !== null && to !== null && item.candidate.date >= from && item.candidate.date <= to),
  );
  const docs = documentNumbers(payload);
  const banks = document.transactions.map((row, index) => ({ date: row.date, value: row.value, ndocumento: docs[index] ?? null }));
  const linked = automaticLinks(banks, existing);
  document.transactions.forEach((bankTransaction, index) => {
    const id = linked[index] ?? null;
    const matched = candidatesFor(banks[index], existing);
    bankTransaction.candidates = matched
      .filter((item) => !item.reconciled || item.candidate.id === id)
      .map((item) => item.candidate);
    linkable[index] = matched.map((item) => item.candidate);
    bankTransaction.conciliateWith = id;
    if (id !== null) bankTransaction.defaultAction = 'conciliate';
  });
  return { linkable, existing: new Map(existing.map((item) => [item.candidate.id, item])) };
}

/** A checking account searches the statement period ±2 days; no period means nothing to search. */
async function windowRows(document: ImportDocument): Promise<unknown[]> {
  const { from, to } = document.search;
  if (from === null || to === null) return [];
  return fetchImportCandidates(document.account.id, from, to);
}

/** A card's candidates are its whole `proximoVencimento` invoice, like the web: no date window. */
async function invoiceRows(account: Account): Promise<unknown[]> {
  const due = ownDueDate(account);
  if (due === null) exitWithError(`Account ${account.id} has no proximoVencimento date to load an invoice from.`);
  const invoice = await fetchCardInvoice(account.id, due);
  if (!Array.isArray(invoice.lancamentos)) {
    throw new Error(`GET /v1/cartoes/${account.id}/fatura/${due} did not return lancamentos`);
  }
  return invoice.lancamentos;
}

/** `{inicio, fim, saldo, lancamentos}` from the connection, or null without a Bank Transaction in it (the web shows no badge). */
function summaryStatement(summary: unknown): Record<string, unknown> | null {
  const record = asRecord(summary);
  const rows = record?.lancamentos;
  return Array.isArray(rows) && rows.length > 0 ? record : null;
}

/** Why there is nothing to list or import, and how to load more. */
export function nothingNewMessage(document: ImportDocument): string {
  const none = `No bank transactions since ${document.since ?? '-'}.`;
  const floor = earliestSince();
  if (document.since !== null && document.since <= floor) return none;
  return `${none} To look further back, use --since <YYYY-MM-DD> (${floor} or later).`;
}

export function statementRows(payload: unknown): unknown[] {
  const rows = asRecord(payload)?.lancamentos;
  return Array.isArray(rows) ? rows : [];
}

function documentNumbers(payload: unknown): (string | null)[] {
  return statementRows(payload).map((row) => nonEmptyTextOrNull(asRecord(row)?.ndocumento));
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
  for (const bankTransaction of document.transactions) {
    table.push([
      cell(bankTransaction.prefix),
      cell(bankTransaction.date),
      bankTransaction.value === null ? chalk.gray('-') : formatCurrency(bankTransaction.value),
      cell(bankTransaction.description),
      cell(categoryLabel(bankTransaction.suggestedCategory)),
      cell(bankTransaction.suggestedDescription),
      bankTransaction.suggestedTagIds.length === 0 ? chalk.gray('-') : bankTransaction.suggestedTagIds.join(', '),
      cell(bankTransaction.duplicateOf),
      bankTransaction.candidates.length === 0
        ? chalk.gray('-')
        : bankTransaction.candidates
          .map((item) => (item.id === bankTransaction.conciliateWith ? `${item.id} (linked)` : String(item.id)))
          .join(', '),
      bankTransaction.defaultAction,
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
