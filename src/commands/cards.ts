import { Command } from 'commander';
import Table from 'cli-table3';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { action, exitWithError } from '../utils/action.js';
import { fetchAccounts, fetchAccountById, normalizeAccounts, isCreditCard, fetchCardInvoice, normalizeCardEntries, fetchFirstInvoiceDate, fetchCardFuture, normalizeCardInstallments } from '../lib/api.js';
import { resolveId } from '../lib/aliases.js';

function formatCurrency(value: number): string {
  const formatted = value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
  return value >= 0 ? chalk.green(formatted) : chalk.red(formatted);
}

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
    const normalized = normalizeAccounts({ items: creditCards, meta: response.meta });
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

  let dueDate: string;
  if (options.month) {
    const match = options.month.match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      exitWithError('Invalid month format. Use YYYY-MM (e.g., 2026-02)');
    }
    const [, year, month] = match;
    const dayOfMonth = account.proximoVencimento ? new Date(account.proximoVencimento).getDate() : 10;
    dueDate = `${year}-${month}-${dayOfMonth.toString().padStart(2, '0')}`;
  } else {
    dueDate = account.proximoVencimento ?? await fetchFirstInvoiceDate(accountId);
  }

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
  .option('--month <YYYY-MM>', 'Invoice month (default: current/next invoice)')
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
