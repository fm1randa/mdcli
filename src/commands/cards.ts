import { Command } from 'commander';
import Table from 'cli-table3';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { fetchAccounts, normalizeAccounts, isCreditCard, fetchCardInvoice, normalizeCardEntries, fetchFirstInvoiceDate, fetchCardFuture, normalizeCardInstallments } from '../lib/api.js';
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
  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(message);
    process.exit(1);
  }
}

export const cardsCommand = new Command('cards')
  .description('Manage credit cards');

cardsCommand
  .command('list')
  .description('List all credit cards')
  .option('--json', 'Output as JSON')
  .option('--active', 'Show only active credit cards')
  .action(listAction);

async function invoiceAction(options: { account: string; month?: string; json?: boolean }): Promise<void> {
  try {
    const accountId = await resolveId('accounts', options.account);
    if (!accountId) {
      logger.error(`Unknown account: ${options.account}`);
      process.exit(1);
    }

    const response = await fetchAccounts();
    const account = response.items.find(a => a.id === accountId);
    
    if (!account) {
      logger.error(`Account not found: ${accountId}`);
      process.exit(1);
    }

    if (!isCreditCard(account)) {
      logger.error(`Account ${accountId} is not a credit card`);
      process.exit(1);
    }

    let dueDate: string;
    if (options.month) {
      const match = options.month.match(/^(\d{4})-(\d{2})$/);
      if (!match) {
        logger.error('Invalid month format. Use YYYY-MM (e.g., 2026-02)');
        process.exit(1);
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

    const total = entries.reduce((sum, e) => sum + e.value, 0);
    logger.header(`Invoice for ${account.nome} - ${dueDate} (${entries.length} entries) | Total: ${formatCurrency(total)}`);
    console.log(table.toString());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(message);
    process.exit(1);
  }
}

cardsCommand
  .command('invoice')
  .description('Show credit card invoice entries')
  .requiredOption('-a, --account <id>', 'Card ID, alias, or exact name (case-insensitive)')
  .option('--month <YYYY-MM>', 'Invoice month (default: current/next invoice)')
  .option('--json', 'Output as JSON')
  .action(invoiceAction);

async function futureAction(options: { account: string; json?: boolean }): Promise<void> {
  try {
    const accountId = await resolveId('accounts', options.account);
    if (!accountId) {
      logger.error(`Unknown account: ${options.account}`);
      process.exit(1);
    }

    const response = await fetchAccounts();
    const account = response.items.find(a => a.id === accountId);
    
    if (!account) {
      logger.error(`Account not found: ${accountId}`);
      process.exit(1);
    }

    if (!isCreditCard(account)) {
      logger.error(`Account ${accountId} is not a credit card`);
      process.exit(1);
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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(message);
    process.exit(1);
  }
}

cardsCommand
  .command('future')
  .description('Show future installments for credit card')
  .requiredOption('-a, --account <id>', 'Card ID, alias, or exact name (case-insensitive)')
  .option('--json', 'Output as JSON')
  .action(futureAction);
