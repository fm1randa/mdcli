import { Command } from 'commander';
import Table from 'cli-table3';
import chalk from 'chalk';
import * as readline from 'readline';
import { logger } from '../utils/logger.js';
import { fetchEntries, normalizeEntries, createEntry, updateEntry, fetchEntry, deleteEntry } from '../lib/api.js';
import { resolveId, resolveIds } from '../lib/aliases.js';
import type { CreateEntryPayload, CreateEntryAgenda, UpdateEntryPayload } from '../types/index.js';

const STATUS_FLAGS: Record<string, number> = {
  pending: 1,
  confirmed: 2,
  reconciled: 4,
  scheduled: 8,
};

const TYPE_FLAGS: Record<string, number> = {
  expense: 1,
  income: 2,
  'transfer-out': 4,
  'transfer-in': 8,
};

function parseStatusFilter(input: string): number {
  const num = Number(input);
  if (!Number.isNaN(num) && num >= 0 && num <= 15) return num;

  return input.split(',').reduce((mask, name) => {
    const flag = STATUS_FLAGS[name.trim().toLowerCase()];
    if (!flag) {
      logger.warning(`Unknown status: ${name}. Valid: pending, confirmed, reconciled, scheduled`);
    }
    return mask | (flag ?? 0);
  }, 0);
}

function parseTypeFilter(input: string): number {
  const num = Number(input);
  if (!Number.isNaN(num) && num >= 0 && num <= 15) return num;

  return input.split(',').reduce((mask, name) => {
    const flag = TYPE_FLAGS[name.trim().toLowerCase()];
    if (!flag) {
      logger.warning(`Unknown type: ${name}. Valid: expense, income, transfer-out, transfer-in`);
    }
    return mask | (flag ?? 0);
  }, 0);
}

function formatCurrency(value: number): string {
  const formatted = Math.abs(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
  return value >= 0 ? chalk.green(formatted) : chalk.red(formatted);
}

function formatStatus(status: 'reconciled' | 'pending' | 'scheduled'): string {
  const statusConfig = {
    reconciled: { label: 'Reconciled', color: chalk.green },
    pending: { label: 'Pending', color: chalk.yellow },
    scheduled: { label: 'Scheduled', color: chalk.blue },
  };
  const config = statusConfig[status];
  return config.color(config.label);
}

function formatType(type: 'expense' | 'income' | 'transfer'): string {
  const typeConfig = {
    expense: { label: 'Expense', color: chalk.red },
    income: { label: 'Income', color: chalk.green },
    transfer: { label: 'Transfer', color: chalk.cyan },
  };
  const config = typeConfig[type];
  return config.color(config.label);
}

function getDefaultDateRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  };
}

interface ListOptions {
  json?: boolean;
  account?: string;
  from?: string;
  to?: string;
  status?: string;
  type?: string;
  category?: string;
  tag?: string;
  keywords?: string;
  value?: string;
}

async function listAction(options: ListOptions): Promise<void> {
  try {
    if (!options.account) {
      logger.error('At least one account ID or alias is required. Use --account <id> or --account <id1,id2,...>');
      process.exit(1);
    }

    const accountResult = resolveIds('accounts', options.account);
    if (accountResult.unresolved.length > 0) {
      logger.error(`Unknown account alias(es): ${accountResult.unresolved.join(', ')}`);
      process.exit(1);
    }
    const accountIds = accountResult.ids;

    if (accountIds.length === 0) {
      logger.error('At least one account ID or alias is required. Use --account <id> or --account <id1,id2,...>');
      process.exit(1);
    }

    const { startDate: defaultStart, endDate: defaultEnd } = getDefaultDateRange();

    let categoryIds: number[] | undefined;
    if (options.category) {
      const categoryResult = resolveIds('categories', options.category);
      if (categoryResult.unresolved.length > 0) {
        logger.error(`Unknown category alias(es): ${categoryResult.unresolved.join(', ')}`);
        process.exit(1);
      }
      categoryIds = categoryResult.ids;
    }

    let tagIds: number[] | undefined;
    if (options.tag) {
      const tagResult = resolveIds('tags', options.tag);
      if (tagResult.unresolved.length > 0) {
        logger.error(`Unknown tag alias(es): ${tagResult.unresolved.join(', ')}`);
        process.exit(1);
      }
      tagIds = tagResult.ids;
    }
    const status = options.status ? parseStatusFilter(options.status) : undefined;
    const entryType = options.type ? parseTypeFilter(options.type) : undefined;
    const value = options.value ? Number(options.value) : undefined;

    const response = await fetchEntries({
      accountIds,
      startDate: options.from ?? defaultStart,
      endDate: options.to ?? defaultEnd,
      categoryIds,
      tagIds,
      keywords: options.keywords,
      value,
      status,
      entryType,
    });

    const entries = normalizeEntries(response);

    if (options.json) {
      console.log(JSON.stringify(entries, null, 2));
      return;
    }

    const table = new Table({
      head: ['ID', 'Date', 'Description', 'Value', 'Type', 'Status', 'Installment'],
      style: { head: ['cyan'] },
      colWidths: [12, 12, 36, 15, 12, 12, 12],
    });

    for (const entry of entries) {
      table.push([
        entry.id,
        entry.date,
        entry.description.length > 33 ? `${entry.description.slice(0, 33)}...` : entry.description,
        formatCurrency(entry.value),
        formatType(entry.type),
        formatStatus(entry.status),
        entry.installment ?? chalk.gray('-'),
      ]);
    }

    const total = entries.reduce((sum, e) => sum + e.value, 0);
    logger.header(`Entries (${entries.length}) | Total: ${formatCurrency(total)}`);
    console.log(table.toString());
    console.log(chalk.gray(`\nPage ${response.meta.page} of ${Math.ceil(response.meta.total / response.meta.pageSize)} (${response.meta.total} total entries)`));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(message);
    process.exit(1);
  }
}

export const entriesCommand = new Command('entries')
  .description('Manage entries (lancamentos)');

entriesCommand
  .command('list')
  .description('List entries for an account')
  .requiredOption('-a, --account <ids>', 'Account ID(s) or alias(es), comma-separated')
  .option('-f, --from <date>', 'Start date (YYYY-MM-DD), defaults to first day of current month')
  .option('-t, --to <date>', 'End date (YYYY-MM-DD), defaults to last day of current month')
  .option('-s, --status <filter>', 'Filter by status: pending, confirmed, reconciled, scheduled (or bitmask 0-15)')
  .option('-T, --type <filter>', 'Filter by type: expense, income, transfer-out, transfer-in (or bitmask 0-15)')
  .option('-c, --category <ids>', 'Filter by category ID(s) or alias(es), comma-separated')
  .option('-g, --tag <ids>', 'Filter by tag ID(s) or alias(es), comma-separated')
  .option('-k, --keywords <text>', 'Search by keywords')
  .option('-v, --value <amount>', 'Filter by value')
  .option('--json', 'Output as JSON')
  .action(listAction);

interface CreateOptions {
  account: string;
  description: string;
  value: string;
  type?: string;
  category?: string;
  date?: string;
  tags?: string;
  notes?: string;
  pending?: boolean;
  repeat?: string;
  frequency?: string;
  times?: string;
  json?: boolean;
}

const INTERVAL_MAP: Record<string, 'd' | 'w' | 'M' | 'y'> = {
  daily: 'd',
  weekly: 'w',
  monthly: 'M',
  yearly: 'y',
  d: 'd',
  w: 'w',
  m: 'M',
  y: 'y',
};

function parseRecurrence(options: CreateOptions): CreateEntryAgenda | undefined {
  if (!options.repeat) return undefined;

  const intervalo = INTERVAL_MAP[options.repeat.toLowerCase()];
  if (!intervalo) {
    logger.error(`Invalid repeat interval: ${options.repeat}. Valid: daily, weekly, monthly, yearly (or d, w, m, y)`);
    process.exit(1);
  }

  if (options.frequency && options.times) {
    logger.error('Cannot use --frequency and --times together. Use --frequency for interval spacing OR --times for total occurrences.');
    process.exit(1);
  }

  return {
    repeticao: 'f',
    intervalo,
    quantidade: options.times ? Number(options.times) : -1,
    frequencia: options.frequency ? Number(options.frequency) : 1,
    inicial: 1,
  };
}

function getMonthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

function mapTypeToApi(type: string): 'd' | 'r' | 't' {
  const typeMap: Record<string, 'd' | 'r' | 't'> = {
    expense: 'd',
    income: 'r',
    transfer: 't',
    d: 'd',
    r: 'r',
    t: 't',
  };
  return typeMap[type.toLowerCase()] ?? 'd';
}

async function createAction(options: CreateOptions): Promise<void> {
  try {
    const value = Number(options.value);
    if (Number.isNaN(value)) {
      logger.error('Invalid value. Must be a number.');
      process.exit(1);
    }

    const accountId = resolveId('accounts', options.account);
    if (accountId === null) {
      logger.error(`Unknown account: ${options.account}`);
      process.exit(1);
    }

    let categoryId: number | null = null;
    if (options.category) {
      categoryId = resolveId('categories', options.category);
      if (categoryId === null) {
        logger.error(`Unknown category: ${options.category}`);
        process.exit(1);
      }
    }

    let tagIds: number[] = [];
    if (options.tags) {
      const tagResult = resolveIds('tags', options.tags);
      if (tagResult.unresolved.length > 0) {
        logger.error(`Unknown tag alias(es): ${tagResult.unresolved.join(', ')}`);
        process.exit(1);
      }
      tagIds = tagResult.ids;
    }

    const tipo = mapTypeToApi(options.type ?? 'expense');
    const isReconciled = !options.pending;
    const now = new Date();
    const dateStr = options.date ?? now.toISOString().split('T')[0];
    const { start: monthStart, end: monthEnd } = getMonthRange();
    const expenseNeedsNegativeValue = tipo === 'd';
    const finalValue = expenseNeedsNegativeValue ? -Math.abs(value) : Math.abs(value);
    const agenda = parseRecurrence(options);

    const payload: CreateEntryPayload = {
      descricao: options.description,
      tipo,
      status: {
        confirmado: true,
        conciliado: isReconciled,
      },
      exibirCp: true,
      exibirCr: true,
      automatico: false,
      lembrete: 0,
      anexos: [],
      ...(agenda && { agenda }),
      '#': null,
      conta: accountId.toString(),
      inicio: monthStart,
      fim: monthEnd,
      i: 'm',
      valor: finalValue,
      data: now.toISOString(),
      base: null,
      categoria: categoryId,
      metaEconomia: null,
      observacoes: options.notes ?? '',
      tags: tagIds,
      transferencia: false,
      conciliado: isReconciled,
      dataEfetiva: dateStr,
      dataPrevista: dateStr,
      valorEfetivo: finalValue,
      valorPrevisto: finalValue,
    };

    const response = await createEntry(payload);

    if (options.json) {
      console.log(JSON.stringify(response, null, 2));
      return;
    }

    logger.success(`Entry created successfully!`);
    console.log(`  ${chalk.gray('ID:')} ${response.id}`);
    console.log(`  ${chalk.gray('Description:')} ${response.descricao}`);
    console.log(`  ${chalk.gray('Value:')} ${formatCurrency(response.valor)}`);
    console.log(`  ${chalk.gray('Date:')} ${response.data}`);
    const statusDisplay = response.status === 'conciliado' ? 'reconciled' 
      : response.status === 'pendente' ? 'pending' : 'scheduled';
    console.log(`  ${chalk.gray('Status:')} ${formatStatus(statusDisplay as 'reconciled' | 'pending' | 'scheduled')}`);
    if (agenda) {
      const intervalLabels: Record<string, string> = { d: 'daily', w: 'weekly', M: 'monthly', y: 'yearly' };
      const timesLabel = agenda.quantidade === -1 ? 'infinite' : `${agenda.quantidade} times`;
      console.log(`  ${chalk.gray('Recurrence:')} ${intervalLabels[agenda.intervalo]} (every ${agenda.frequencia}, ${timesLabel})`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(message);
    process.exit(1);
  }
}

entriesCommand
  .command('create')
  .description('Create a new entry')
  .requiredOption('-a, --account <id>', 'Account ID or alias')
  .requiredOption('-d, --description <text>', 'Entry description')
  .requiredOption('-v, --value <amount>', 'Entry value (positive number)')
  .option('-T, --type <type>', 'Entry type: expense, income, transfer (default: expense)', 'expense')
  .option('-c, --category <id>', 'Category ID or alias')
  .option('-D, --date <date>', 'Entry date (YYYY-MM-DD), defaults to today')
  .option('-g, --tags <ids>', 'Tag ID(s) or alias(es), comma-separated')
  .option('-n, --notes <text>', 'Additional notes/observations')
  .option('-p, --pending', 'Create as pending (not reconciled)')
  .option('-r, --repeat <interval>', 'Recurrence: daily, weekly, monthly, yearly (or d, w, m, y)')
  .option('--frequency <n>', 'Repeat every N intervals, e.g. --frequency 2 = every 2 months (default: 1)')
  .option('--times <n>', 'Total occurrences, e.g. --times 6 = 6 times then stop (default: infinite)')
  .option('--json', 'Output as JSON')
  .action(createAction);

interface UpdateOptions {
  description?: string;
  value?: string;
  type?: string;
  category?: string;
  date?: string;
  tags?: string;
  notes?: string;
  pending?: boolean;
  reconciled?: boolean;
  json?: boolean;
}

async function updateAction(id: string, options: UpdateOptions): Promise<void> {
  try {
    const entryId = Number(id);
    if (Number.isNaN(entryId)) {
      logger.error('Invalid entry ID. Must be a number.');
      process.exit(1);
    }

    // Validate options that need resolution before fetching entry
    let categoryId: number | null = null;
    if (options.category !== undefined) {
      categoryId = resolveId('categories', options.category);
      if (categoryId === null) {
        logger.error(`Unknown category: ${options.category}`);
        process.exit(1);
      }
    }

    let tagIds: number[] | undefined;
    if (options.tags !== undefined) {
      const tagResult = resolveIds('tags', options.tags);
      if (tagResult.unresolved.length > 0) {
        logger.error(`Unknown tag alias(es): ${tagResult.unresolved.join(', ')}`);
        process.exit(1);
      }
      tagIds = tagResult.ids;
    }

    let value: number | undefined;
    if (options.value !== undefined) {
      value = Number(options.value);
      if (Number.isNaN(value)) {
        logger.error('Invalid value. Must be a number.');
        process.exit(1);
      }
    }

    const hasChanges = options.description !== undefined ||
      options.value !== undefined ||
      options.type !== undefined ||
      options.category !== undefined ||
      options.date !== undefined ||
      options.tags !== undefined ||
      options.notes !== undefined ||
      options.pending ||
      options.reconciled;

    if (!hasChanges) {
      logger.error('No changes specified. Use options like --description, --value, --date, etc.');
      process.exit(1);
    }

    // Fetch existing entry
    const existing = await fetchEntry(entryId);

    // Build payload by merging existing data with updates
    const payload: Record<string, unknown> = {
      id: entryId,
      descricao: options.description ?? existing.descricao,
      conciliado: existing.conciliado,
      status: {
        confirmado: true,
        conciliado: existing.conciliado ?? false,
      },
      tipo: options.type ? mapTypeToApi(options.type) : existing.tipo,
      valor: value ?? existing.valor,
      valorPrevisto: value ?? existing.valorPrevisto ?? existing.valor,
      valorEfetivo: value ?? existing.valorEfetivo ?? existing.valor,
      data: existing.data,
      dataPrevista: options.date ?? existing.dataPrevista,
      dataEfetiva: options.date ?? existing.dataEfetiva ?? existing.dataPrevista,
      dataCriacao: existing.dataCriacao,
      exibirCp: existing.exibirCp ?? true,
      exibirCr: existing.exibirCr ?? true,
      permissoes: existing.permissoes,
      estorno: existing.estorno ?? false,
      conta: existing.conta,
      categoria: categoryId ?? existing.categoria ?? null,
      tags: tagIds ?? existing.tags ?? [],
      observacoes: options.notes ?? existing.observacoes ?? '',
      ndocumento: existing.ndocumento ?? '',
      lembrete: existing.lembrete ?? 0,
      automatico: existing.automatico ?? false,
      agenda: existing.agenda,
      metaEconomia: null,
      transferencia: existing.transferencia ?? false,
    };

    // Handle status changes
    if (options.pending) {
      payload.status = { confirmado: true, conciliado: false };
      payload.conciliado = false;
    } else if (options.reconciled) {
      payload.status = { confirmado: true, conciliado: true };
      payload.conciliado = true;
    }

    const response = await updateEntry(entryId, payload as unknown as UpdateEntryPayload);

    if (options.json) {
      console.log(JSON.stringify(response, null, 2));
      return;
    }

    logger.success(`Entry updated successfully!`);
    console.log(`  ${chalk.gray('ID:')} ${response.id}`);
    console.log(`  ${chalk.gray('Description:')} ${response.descricao}`);
    console.log(`  ${chalk.gray('Value:')} ${formatCurrency(response.valor)}`);
    console.log(`  ${chalk.gray('Date:')} ${response.data}`);
    const statusDisplay = response.status === 'conciliado' ? 'reconciled'
      : response.status === 'pendente' ? 'pending' : 'scheduled';
    console.log(`  ${chalk.gray('Status:')} ${formatStatus(statusDisplay as 'reconciled' | 'pending' | 'scheduled')}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(message);
    process.exit(1);
  }
}

entriesCommand
  .command('update <id>')
  .description('Update an existing entry (partial update - only send fields you want to change)')
  .option('-d, --description <text>', 'Entry description')
  .option('-v, --value <amount>', 'Entry value')
  .option('-T, --type <type>', 'Entry type: expense, income, transfer')
  .option('-c, --category <id>', 'Category ID or alias')
  .option('-D, --date <date>', 'Entry date (YYYY-MM-DD)')
  .option('-g, --tags <ids>', 'Tag ID(s) or alias(es), comma-separated')
  .option('-n, --notes <text>', 'Additional notes/observations')
  .option('-p, --pending', 'Set as pending (not reconciled)')
  .option('-r, --reconciled', 'Set as reconciled')
  .option('--json', 'Output as JSON')
  .action(updateAction);

interface DeleteOptions {
  dangerouslySkipConfirmation?: boolean;
  json?: boolean;
}

async function promptConfirmation(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

async function deleteAction(id: string, options: DeleteOptions): Promise<void> {
  try {
    const entryId = Number(id);
    if (Number.isNaN(entryId)) {
      logger.error('Invalid entry ID. Must be a number.');
      process.exit(1);
    }

    const entry = await fetchEntry(entryId);

    if (!options.dangerouslySkipConfirmation) {
      console.log(chalk.yellow('\nEntry to be deleted:'));
      console.log(`  ${chalk.gray('ID:')} ${entry.id}`);
      console.log(`  ${chalk.gray('Description:')} ${entry.descricao}`);
      console.log(`  ${chalk.gray('Value:')} ${formatCurrency(entry.valor)}`);
      console.log(`  ${chalk.gray('Date:')} ${entry.data}`);
      console.log();

      const confirmed = await promptConfirmation(chalk.red('Are you sure you want to delete this entry? (y/N) '));

      if (!confirmed) {
        logger.info('Deletion cancelled.');
        process.exit(0);
      }
    }

    await deleteEntry(entryId);

    if (options.json) {
      console.log(JSON.stringify({ deleted: true, id: entryId }, null, 2));
      return;
    }

    logger.success(`Entry ${entryId} deleted successfully!`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(message);
    process.exit(1);
  }
}

entriesCommand
  .command('delete <id>')
  .description('Delete an entry')
  .option('--dangerously-skip-confirmation', 'Skip confirmation prompt')
  .option('--json', 'Output as JSON')
  .action(deleteAction);
