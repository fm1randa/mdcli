import { Command } from 'commander';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { action, exitWithError } from '../utils/action.js';
import { t } from '../lib/i18n/index.js';
import { fetchAccounts, fetchAccountById, normalizeCards, isCreditCard, fetchCardInvoice, normalizeCardEntries, fetchCardFuture, normalizeCardInstallments } from '../lib/api.js';
import { resolveAccountOrExit } from './account-id.js';
import { formatCurrency } from '../utils/currency.js';
import { cell, truncate } from '../utils/text.js';
import { cardDueAnchor } from './entries/card-invoice.js';
import { dueDateInMonth, parseInvoiceMonth } from '../lib/dates.js';
import { normalizeInvoiceSummary } from '../lib/invoice-summary.js';
import type { Account, NormalizedInvoiceSummary } from '../types/index.js';
import { newTable } from '../utils/table.js';

function formatStatus(active: boolean, closed: boolean): string {
  if (closed) return chalk.red(t('statusClosed'));
  return active ? chalk.green(t('statusActive')) : chalk.gray(t('statusInactive'));
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

  const table = newTable({
    head: [t('labelId'), t('labelName'), t('labelBank'), t('labelLimit'), t('cardsNextDue'), t('labelStatus')],
    style: { head: ['cyan'] },
  });

  for (const card of creditCards) {
    table.push([
      card.id.toString(),
      card.nome,
      cell(card.banco?.nome),
      cell(card.limite || null, formatCurrency),
      // eslint-disable-next-line local/no-due-anchor-fallback -- display only (Next Due column), not an invoice anchor (see cardDueAnchor)
      cell(card.proximoVencimento),
      formatStatus(card.status, card.encerrada),
    ]);
  }

  logger.header(t('cardsHeader', creditCards.length));
  console.log(table.toString());
}

export const cardsCommand = new Command('cards')
  .description(t('cardsManageDescription'));

cardsCommand
  .command('list')
  .description(t('cardsListDescription'))
  .option('--json', t('jsonOption'))
  .option('--active', t('cardsActiveOnlyOption'))
  .action(action(listAction));

interface SummaryRow {
  label: string;
  value: string;
}

/** Text rows of the invoice summary; a field the API leaves out is not shown. */
function invoiceSummaryRows(summary: NormalizedInvoiceSummary): SummaryRow[] {
  const rows: Array<[string, string | number | null]> = [
    [t('labelDueDate'), summary.dueDate],
    [t('labelClosingDate'), summary.closingDate],
    [t('labelPreviousInvoice'), summary.previousInvoice],
    [t('labelPaid'), summary.paid],
    [t('labelScheduledPayments'), summary.scheduledPayments],
    [t('labelExpenses'), summary.expenses],
    [t('labelIncome'), summary.income],
    [t('labelInvoiceTotal'), summary.total],
    [t('labelToPay'), summary.toPay],
    [t('statusReconciled'), summary.reconciled],
    [t('labelUnreconciled'), summary.unreconciled],
    [t('labelLimit'), summary.limit],
    [t('labelAvailable'), summary.available],
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
  const accountId = await resolveAccountOrExit(input);

  const account = await fetchAccountById(accountId);
  if (!account) {
    exitWithError(t('errorAccountNotFoundById', accountId));
  }

  if (!isCreditCard(account)) {
    exitWithError(t('errorNotCreditCard', accountId));
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

  const table = newTable({
    head: [t('labelPurchase'), t('labelDescription'), t('labelValue'), t('labelCategory')],
    style: { head: ['cyan'] },
    colWidths: INVOICE_COL_WIDTHS,
  });

  for (const entry of entries) {
    table.push([
      // The web's invoice lists items by purchase date; date in --json is the due date.
      entry.purchaseDate,
      truncate(entry.description, INVOICE_COL_WIDTHS[1]),
      formatCurrency(entry.value),
      cell(entry.categoryId),
    ]);
  }

  // Summing the items double-counts when a payment (tipo p) is listed: use the
  // API's bill total instead (dogfood 2026-10-19).
  const total = summary.total ?? invoiceResponse.valor;
  logger.header(t('cardsInvoiceHeader', account.nome, dueDate, entries.length, formatCurrency(total)));
  printInvoiceSummary(invoiceSummaryRows(summary));
  // --summary without --json: the summary only, no items table.
  if (options.summary) return;
  console.log(table.toString());
}

cardsCommand
  .command('invoice')
  .description(t('cardsInvoiceDescription'))
  .requiredOption('-a, --account <id>', t('cardsAccountOption'))
  .option('--month <YYYY-MM>', t('cardsInvoiceMonthOption'))
  .option('--json', t('cardsInvoiceJsonOption'))
  .option('--summary', t('cardsInvoiceSummaryOption'))
  .action(action(invoiceAction));

async function futureAction(options: { account: string; json?: boolean }): Promise<void> {
  const account = await resolveCardOrExit(options.account);

  const futureResponse = await fetchCardFuture(account.id);
  const installments = normalizeCardInstallments(futureResponse);

  if (options.json) {
    console.log(JSON.stringify(installments, null, 2));
    return;
  }

  const table = newTable({
    head: [t('labelDate'), t('labelDescription'), t('labelValue'), t('labelInstallment'), t('labelRemaining')],
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
  logger.header(t('cardsFutureHeader', account.nome, installments.length, formatCurrency(total)));
  console.log(table.toString());
}

cardsCommand
  .command('future')
  .description(t('cardsFutureDescription'))
  .requiredOption('-a, --account <id>', t('cardsAccountOption'))
  .option('--json', t('jsonOption'))
  .action(action(futureAction));
