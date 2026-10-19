import { Command } from 'commander';
import Table from 'cli-table3';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { action, exitWithError } from '../utils/action.js';
import { fetchAccounts, fetchAccountById, normalizeCards, isCreditCard, fetchCardInvoice, normalizeCardEntries, fetchFirstInvoiceDate, fetchCardFuture, normalizeCardInstallments } from '../lib/api.js';
import { resolveId } from '../lib/aliases.js';
import { formatCurrency } from '../utils/currency.js';
import { dueDateInMonth, parseInvoiceMonth } from '../lib/dates.js';

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

async function invoiceAction(options: { account: string; month?: string; json?: boolean }): Promise<void> {
  // Before any API call: 2026-13 used to reach the API (400) and 2026-00 to
  // show December's invoice (dogfood 2026-10-19).
  if (options.month) parseInvoiceMonth(options.month);

  const accountId = await resolveId('accounts', options.account);
  if (!accountId) {
    exitWithError(`Unknown account: ${options.account}`);
  }

  const account = await fetchAccountById(accountId);

  if (!account) {
    exitWithError(`Account not found: ${accountId}`);
  }

  if (!isCreditCard(account)) {
    exitWithError(`Account ${accountId} is not a credit card`);
  }

  // The card's due day comes from proximoVencimento; 10 when it has none.
  const dueDate = options.month
    ? dueDateInMonth(options.month, account.proximoVencimento ?? '0000-00-10')
    : (account.proximoVencimento ?? (await fetchFirstInvoiceDate(accountId)));

  const invoiceResponse = await fetchCardInvoice(accountId, dueDate);
  const entries = normalizeCardEntries(invoiceResponse);

  if (options.json) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  const table = new Table({
    head: ['Date', 'Description', 'Value', 'Category'],
    style: { head: ['cyan'] },
    colWidths: [12, 40, 15, 12],
  });

  for (const entry of entries) {
    table.push([
      entry.date,
      entry.description.length > 37 ? `${entry.description.slice(0, 37)}...` : entry.description,
      formatCurrency(entry.value),
      entry.categoryId?.toString() ?? chalk.gray('-'),
    ]);
  }

  // Summing the items double-counts when a payment (tipo p) is listed: use the
  // API's bill total instead (dogfood 2026-10-19).
  const total = invoiceResponse.resumo?.totalFatura ?? invoiceResponse.valor;
  logger.header(`Invoice for ${account.nome} - ${dueDate} (${entries.length} entries) | Total: ${formatCurrency(total)}`);
  console.log(table.toString());
}

cardsCommand
  .command('invoice')
  .description('Show credit card invoice entries')
  .requiredOption('-a, --account <id>', 'Card ID, alias, or exact name (case-insensitive)')
  .option('--month <YYYY-MM>', 'Invoice month, due on the card\'s due day (default: current/next invoice)')
  .option('--json', 'Output as JSON')
  .action(action(invoiceAction));

async function futureAction(options: { account: string; json?: boolean }): Promise<void> {
  const accountId = await resolveId('accounts', options.account);
  if (!accountId) {
    exitWithError(`Unknown account: ${options.account}`);
  }

  const account = await fetchAccountById(accountId);

  if (!account) {
    exitWithError(`Account not found: ${accountId}`);
  }

  if (!isCreditCard(account)) {
    exitWithError(`Account ${accountId} is not a credit card`);
  }

  const futureResponse = await fetchCardFuture(accountId);
  const installments = normalizeCardInstallments(futureResponse);

  if (options.json) {
    console.log(JSON.stringify(installments, null, 2));
    return;
  }

  const table = new Table({
    head: ['Date', 'Description', 'Value', 'Installment', 'Remaining'],
    style: { head: ['cyan'] },
    colWidths: [12, 32, 15, 15, 12],
  });

  for (const item of installments) {
    table.push([
      item.date,
      item.description.length > 29 ? `${item.description.slice(0, 29)}...` : item.description,
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
