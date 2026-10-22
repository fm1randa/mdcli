import Table from 'cli-table3';
import chalk from 'chalk';
import { fetchAccountById, fetchBankTransactions } from '../../../lib/api.js';
import { resolveId } from '../../../lib/aliases.js';
import { exitWithError } from '../../../utils/action.js';
import { formatCurrency } from '../../../utils/currency.js';
import { logger } from '../../../utils/logger.js';
import { toImportDocument, type ImportDocument } from './document.js';
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

  if (options.json) {
    console.log(JSON.stringify(document, null, 2));
    return;
  }
  printStatement(document);
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
    head: ['Prefix', 'Date', 'Value', 'Description', 'Action'],
    style: { head: ['cyan'] },
  });
  for (const transaction of document.transactions) {
    table.push([
      cell(transaction.prefix),
      cell(transaction.date),
      transaction.value === null ? chalk.gray('-') : formatCurrency(transaction.value),
      cell(transaction.description),
      transaction.defaultAction,
    ]);
  }
  logger.header(`Bank transactions (${document.transactions.length}) since ${document.since}`);
  console.log(table.toString());
}

function cell(value: string | null): string {
  return value === null ? chalk.gray('-') : value;
}
