import { Command } from 'commander';
import Table from 'cli-table3';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { action, exitWithError } from '../utils/action.js';
import { fetchAccounts, fetchAccountById, normalizeCards, isCreditCard, fetchCardInvoice, normalizeCardEntries, fetchCardFuture, normalizeCardInstallments } from '../lib/api.js';
import { resolveId } from '../lib/aliases.js';
import { formatCurrency } from '../utils/currency.js';
import { truncate } from '../utils/text.js';
import { cardDueAnchor } from './entries/card-invoice.js';
import { dueDateInMonth, parseInvoiceMonth } from '../lib/dates.js';
import { normalizeInvoiceSummary } from '../lib/invoice-summary.js';
import type { Account, NormalizedInvoiceSummary } from '../types/index.js';

function formatStatus(active: boolean, closed: boolean): string {
  if (closed) return chalk.red('Closed');
  return active ? chalk.green('Active') : chalk.gray('Inactive');
}

async function listAction(options: { json?: boolean; active?: boolean }): Promise<void> {
  const response = await fetchAccounts();
  const allAccounts = response.items;
  
  let creditCards = allAccounts.filter(isCreditCard);

  if (options.active) {
    creditCards = creditCards.filter((a) => a.status && !a.encerrada);
  }

  if (options.json) {
    const normalized = normalizeCards({ items: creditCards, meta: response.meta });
    console.log(JSON.stringify(normalized, null, 2));
    return;
  }

  const table = new Table({
    head: ['ID', 'Name', 'Bank', 'Limit', 'Next Due', 'Status'],
    style: { head: ['cyan'] },
  });

  for (const card of creditCards) {
    table.push([
      card.id.toString(),
      card.nome,
      card.banco?.nome ?? chalk.gray('-'),
      card.limite ? formatCurrency(card.limite) : chalk.gray('-'),
      // Display only, not an invoice anchor (see cardDueAnchor).
      // eslint-disable-next-line no-restricted-syntax
      card.proximoVencimento ?? chalk.gray('-'),
      formatStatus(card.status, card.encerrada),
    ]);
  }

  logger.header(`Credit Cards (${creditCards.length})`);
  console.log(table.toString());
}

export const cardsCommand = new Command('cards')
  .description('Manage credit cards');

cardsCommand
  .command('list')
  .description('List all credit cards')
  .option('--json', 'Output as JSON')
  .option('--active', 'Show only active credit cards')
  .action(action(listAction));

interface SummaryRow {
  label: string;
  value: string;
}

/** Text rows of the invoice summary; a field the API leaves out is not shown. */
function invoiceSummaryRows(summary: NormalizedInvoiceSummary): SummaryRow[] {
  const rows: Array<[string, string | number | null]> = [
    ['Due date', summary.dueDate],
    ['Closing date', summary.closingDate],
    ['Previous invoice', summary.previousInvoice],
    ['Paid', summary.paid],
    ['Scheduled payments', summary.scheduledPayments],
    ['Expenses', summary.expenses],
    ['Income', summary.income],
    ['Invoice total', summary.total],
    ['To pay', summary.toPay],
    ['Reconciled', summary.reconciled],
    ['Unreconciled', summary.unreconciled],
    ['Limit', summary.limit],
    ['Available', summary.available],
  ];
  return rows.flatMap(([label, value]) => {
    if (typeof value === 'string') return [{ label, value }];
    if (typeof value === 'number') return [{ label, value: formatCurrency(value) }];
    return [];
  });
}

function printInvoiceSummary(rows: SummaryRow[]): void {
  const width = Math.max(...rows.map((row) => row.label.length));
  for (const row of rows) {
    console.log(`  ${chalk.cyan(row.label.padEnd(width))}  ${row.value}`);
  }
}

/** The credit card an -a value names, or exit with why it is not one. */
async function resolveCardOrExit(input: string): Promise<Account> {
  const accountId = await resolveId('accounts', input);
  if (!accountId) {
    exitWithError(`Unknown account: ${input}`);
  }

  const account = await fetchAccountById(accountId);
  if (!account) {
    exitWithError(`Account not found: ${accountId}`);
  }

  if (!isCreditCard(account)) {
    exitWithError(`Account ${accountId} is not a credit card`);
  }
  return account;
}

const INVOICE_COL_WIDTHS = [12, 40, 15, 12];
const FUTURE_COL_WIDTHS = [12, 32, 15, 15, 12];

async function invoiceAction(options: { account: string; month?: string; json?: boolean; summary?: boolean }): Promise<void> {
  // Before any API call: 2026-13 used to reach the API (400) and 2026-00 to
  // show December's invoice (dogfood 2026-10-19).
  if (options.month) parseInvoiceMonth(options.month);

  const account = await resolveCardOrExit(options.account);

  // The due day is the card's anchor (cardDueAnchor), same as entries list
  // and entries create use.
  const anchor = await cardDueAnchor(account);
  const dueDate = options.month ? dueDateInMonth(options.month, anchor) : anchor;

  const invoiceResponse = await fetchCardInvoice(account.id, dueDate);
  const entries = normalizeCardEntries(invoiceResponse);
  const summary = normalizeInvoiceSummary(invoiceResponse, account);

  // --json alone stays the bare array of items (Filipe, option B, 2026-10-19);
  // --summary adds the bill: { invoice, entries }.
  if (options.json) {
    console.log(JSON.stringify(options.summary ? { invoice: summary, entries } : entries, null, 2));
    return;
  }

  const table = new Table({
    head: ['Purchase', 'Description', 'Value', 'Category'],
    style: { head: ['cyan'] },
    colWidths: INVOICE_COL_WIDTHS,
  });

  for (const entry of entries) {
    table.push([
      // The web's invoice lists items by purchase date; date in --json is the due date.
      entry.purchaseDate,
      truncate(entry.description, INVOICE_COL_WIDTHS[1]),
      formatCurrency(entry.value),
      entry.categoryId?.toString() ?? chalk.gray('-'),
    ]);
  }

  // Summing the items double-counts when a payment (tipo p) is listed: use the
  // API's bill total instead (dogfood 2026-10-19).
  const total = summary.total ?? invoiceResponse.valor;
  logger.header(`Invoice for ${account.nome} - ${dueDate} (${entries.length} entries) | Total: ${formatCurrency(total)}`);
  printInvoiceSummary(invoiceSummaryRows(summary));
  // --summary without --json: the summary only, no items table.
  if (options.summary) return;
  console.log(table.toString());
}

cardsCommand
  .command('invoice')
  .description('Show credit card invoice entries')
  .requiredOption('-a, --account <id>', 'Card ID, alias, or exact name (case-insensitive)')
  .option('--month <YYYY-MM>', 'Invoice month, due on the card\'s due day (default: current/next invoice)')
  .option('--json', 'Output as JSON (an array of items)')
  .option('--summary', 'Only the invoice summary; with --json, print { invoice, entries } instead of the array')
  .action(action(invoiceAction));

async function futureAction(options: { account: string; json?: boolean }): Promise<void> {
  const account = await resolveCardOrExit(options.account);

  const futureResponse = await fetchCardFuture(account.id);
  const installments = normalizeCardInstallments(futureResponse);

  if (options.json) {
    console.log(JSON.stringify(installments, null, 2));
    return;
  }

  const table = new Table({
    head: ['Date', 'Description', 'Value', 'Installment', 'Remaining'],
    style: { head: ['cyan'] },
    colWidths: FUTURE_COL_WIDTHS,
  });

  for (const item of installments) {
    table.push([
      item.date,
      truncate(item.description, FUTURE_COL_WIDTHS[1]),
      formatCurrency(item.value),
      item.installment,
      item.remaining.toString(),
    ]);
  }

  const total = installments.reduce((sum, i) => sum + i.value, 0);
  logger.header(`Future Installments for ${account.nome} (${installments.length} items) | Total: ${formatCurrency(total)}`);
  console.log(table.toString());
}

cardsCommand
  .command('future')
  .description('Show future installments for credit card')
  .requiredOption('-a, --account <id>', 'Card ID, alias, or exact name (case-insensitive)')
  .option('--json', 'Output as JSON')
  .action(action(futureAction));
