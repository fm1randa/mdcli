import Table from 'cli-table3';
import chalk from 'chalk';
import { fetchAccountById, fetchBankTransactions, fetchCardInvoice, fetchCategories, fetchImportCandidates, fetchImportDuplicates, isCreditCard } from '../../../lib/api.js';
import { resolveId } from '../../../lib/aliases.js';
import { isCalendarDate } from '../../../lib/dates.js';
import type { Account } from '../../../types/index.js';
import { exitWithError } from '../../../utils/action.js';
import { formatCurrency } from '../../../utils/currency.js';
import { logger } from '../../../utils/logger.js';
import { candidatesFor } from './candidates.js';
import { toImportDocument, type ImportDocument, type SuggestedCategory } from './document.js';
import { duplicateId, loadedDateBounds } from './suggest.js';
import { linkedConnection } from './link.js';
import { asRecord } from './read.js';
import { defaultSince, explicitSince } from './since.js';

interface ImportListOptions {
  account: string;
  since?: string;
  searchFrom?: string;
  searchTo?: string;
  json?: boolean;
}

export async function listAction(options: ImportListOptions): Promise<void> {
  const searchFrom = calendarFlag(options.searchFrom);
  const searchTo = calendarFlag(options.searchTo);
  if (searchFrom !== undefined && searchTo !== undefined && searchFrom > searchTo) {
    exitWithError(`Search start ${searchFrom} is after search end ${searchTo}.`);
  }

  const now = new Date();
  const requested = explicitSince(options.since, now);
  const accountId = await resolveAccount(options.account);
  const link = await linkedConnection(accountId);
  const account = await fetchAccountById(accountId);
  if (account !== undefined && isCreditCard(account) && (searchFrom !== undefined || searchTo !== undefined)) {
    exitWithError('A search window on a credit card is not specified. Candidates come from the invoice of proximoVencimento.');
  }
  const since = requested ?? defaultSince(account?.dataUltimoExtrato, now);
  const payload: unknown = await fetchBankTransactions(link.connectionAccount, since);
  const document = toImportDocument({
    accountId,
    accountName: account?.nome ?? null,
    connectionId: link.connectionId,
    connectionAccount: link.connectionAccount,
    since,
    payload,
  });
  if (searchFrom !== undefined) document.search.from = searchFrom;
  if (searchTo !== undefined) document.search.to = searchTo;
  const from = document.search.from;
  const to = document.search.to;
  if (from !== null && to !== null && from > to) {
    exitWithError(`Search start ${from} is after search end ${to}.`);
  }
  await Promise.all([
    fillCategoryNames(document),
    fillDuplicates(document, accountId),
  ]);
  await fillCandidates(document, account, payload);

  if (options.json) {
    console.log(JSON.stringify(document, null, 2));
    return;
  }
  printStatement(document);
}

/** `nome` from the Category catalog. An id the catalog does not have stays null. */
async function fillCategoryNames(document: ImportDocument): Promise<void> {
  const pending: SuggestedCategory[] = [];
  for (const row of document.transactions) {
    if (row.suggestedCategory !== null) pending.push(row.suggestedCategory);
  }
  if (pending.length === 0) return;
  const { items } = await fetchCategories();
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

/** Same value inside the search window. One or more automatic matches conciliate, and that wins over a duplicate. */
async function fillCandidates(document: ImportDocument, account: Account | undefined, payload: unknown): Promise<void> {
  if (document.transactions.length === 0) return;
  const from = document.search.from;
  const to = document.search.to;
  if (from === null || to === null) return;

  const card = account !== undefined && isCreditCard(account);
  const rows = card
    ? await invoiceRows(account)
    : await fetchImportCandidates(document.account.id, from, to);
  const docs = documentNumbers(payload);
  for (let index = 0; index < document.transactions.length; index += 1) {
    const transaction = document.transactions[index];
    const matched = candidatesFor(
      { date: transaction.date, value: transaction.value, ndocumento: docs[index] ?? null },
      rows,
      { from, to },
      card ? 'invoice' : 'entry',
    );
    transaction.candidates = matched.candidates;
    if (matched.automatic) transaction.defaultAction = 'conciliate';
  }
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

function documentNumbers(payload: unknown): (string | null)[] {
  const rows = asRecord(payload)?.lancamentos;
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const value = asRecord(row)?.ndocumento;
    return typeof value === 'string' && value !== '' ? value : null;
  });
}

function calendarFlag(input: string | undefined): string | undefined {
  if (input === undefined) return undefined;
  if (!isCalendarDate(input)) {
    exitWithError(`Invalid date "${input}". Use YYYY-MM-DD (e.g., 2026-10-03).`);
  }
  return input;
}

async function resolveAccount(input: string): Promise<number> {
  const accountId = await resolveId('accounts', input);
  if (accountId === null) {
    exitWithError(`Unknown account: ${input}`);
  }
  return accountId;
}

function printStatement(document: ImportDocument): void {
  if (document.transactions.length === 0) {
    logger.info(`No bank transactions since ${document.since}.`);
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
        : transaction.candidates.map((item) => String(item.id)).join(', '),
      transaction.defaultAction,
    ]);
  }
  logger.header(`Bank transactions (${document.transactions.length}) since ${document.since}`);
  console.log(table.toString());
}

function categoryLabel(category: SuggestedCategory | null): string | null {
  if (category === null) return null;
  return category.name ?? String(category.id);
}

function cell(value: string | null): string {
  return value === null ? chalk.gray('-') : value;
}
