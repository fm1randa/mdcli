import Table from 'cli-table3';
import chalk from 'chalk';
import { fetchAccountById, fetchBankTransactions, fetchCategories, fetchImportDuplicates } from '../../../lib/api.js';
import { resolveId } from '../../../lib/aliases.js';
import { exitWithError } from '../../../utils/action.js';
import { formatCurrency } from '../../../utils/currency.js';
import { logger } from '../../../utils/logger.js';
import { toImportDocument, type ImportDocument, type SuggestedCategory } from './document.js';
import { duplicateId, loadedDateBounds } from './suggest.js';
import { linkedConnection } from './link.js';
import { defaultSince, explicitSince } from './since.js';

interface ImportListOptions {
  account: string;
  since?: string;
  json?: boolean;
}

export async function listAction(options: ImportListOptions): Promise<void> {
  const now = new Date();
  const requested = explicitSince(options.since, now);
  const accountId = await resolveAccount(options.account);
  const link = await linkedConnection(accountId);
  const account = await fetchAccountById(accountId);
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
  await Promise.all([
    fillCategoryNames(document),
    fillDuplicates(document, accountId),
  ]);

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
