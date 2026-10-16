import { ENTRY_STATUS_LABELS } from '../../lib/normalize.js';
import chalk from 'chalk';
import { logger } from '../../utils/logger.js';
import { exitWithError } from '../../utils/action.js';
import { createEntry, fetchAccountById, isCreditCard, fetchCardInvoice } from '../../lib/api.js';
import { resolveId, resolveIds } from '../../lib/aliases.js';
import type { Account, CreateEntryPayload, CreateEntryAgenda } from '../../types/index.js';
import { formatCurrency, formatStatus } from './format.js';
import { getCurrentMonthRange, isCalendarDate, shiftDueDate, toLocalDateString } from '../../lib/dates.js';

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
  invoice?: string;
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
    exitWithError(`Invalid repeat interval: ${options.repeat}. Valid: daily, weekly, monthly, yearly (or d, w, m, y)`);
  }

  if (options.frequency && options.times) {
    exitWithError('Cannot use --frequency and --times together. Use --frequency for interval spacing OR --times for total occurrences.');
  }

  return {
    repeticao: 'f',
    intervalo,
    quantidade: options.times ? Number(options.times) : -1,
    frequencia: options.frequency ? Number(options.frequency) : 1,
    inicial: 1,
  };
}

const TYPE_MAP: Record<string, 'd' | 'r' | 't'> = {
  expense: 'd',
  income: 'r',
  transfer: 't',
  d: 'd',
  r: 'r',
  t: 't',
};

export function parseTypeOption(type: string): 'd' | 'r' | 't' | undefined {
  return TYPE_MAP[type.toLowerCase()];
}

export function mapTypeToApi(type: string): 'd' | 'r' | 't' {
  return parseTypeOption(type) ?? 'd';
}

const MAX_INVOICE_STEPS = 24;
const INVOICE_MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * Due date of the invoice a card purchase belongs to. With --invoice the user
 * picks it; otherwise walk from the card's next due date using each invoice's
 * real closing date, since closing days drift by a day or two between months.
 * Every step is an offset from the anchor, so a clamped day (31 -> Feb 28)
 * never carries into later months.
 */
async function resolveCardDueDate(account: Account, purchaseDate: string, invoice?: string): Promise<string> {
  const anchor = account.proximoVencimento?.slice(0, 10);

  const match = invoice ? invoice.match(INVOICE_MONTH) : null;
  if (invoice && !match) {
    throw new Error('Invalid invoice month. Use YYYY-MM with a month from 01 to 12 (e.g., 2026-10)');
  }

  if (!anchor) {
    throw new Error(`Card ${account.id} has no next due date, so its invoice due day is unknown.`);
  }

  if (match) {
    return shiftDueDate(`${match[1]}-${match[2]}-${anchor.slice(8, 10)}`, 0);
  }

  const closingOf = async (offset: number): Promise<string> =>
    (await fetchCardInvoice(account.id, shiftDueDate(anchor, offset))).fechamento.slice(0, 10);

  let offset = 0;
  for (let step = 0; step < MAX_INVOICE_STEPS; step++) {
    if (purchaseDate > (await closingOf(offset))) {
      offset += 1;
      continue;
    }
    if (purchaseDate <= (await closingOf(offset - 1))) {
      offset -= 1;
      continue;
    }
    return shiftDueDate(anchor, offset);
  }
  throw new Error(`Could not find the invoice for ${purchaseDate}. Pass it explicitly with --invoice YYYY-MM.`);
}

export async function createAction(options: CreateOptions): Promise<void> {
  const value = Number(options.value);
  if (Number.isNaN(value)) {
    exitWithError('Invalid value. Must be a number.');
  }

  if (!options.category) {
    exitWithError(
      'A category is required to create an entry. Use -c, --category <id|alias>. See available categories with: mdcli categories list'
    );
  }

  const accountId = await resolveId('accounts', options.account);
  if (accountId === null) {
    exitWithError(`Unknown account: ${options.account}`);
  }

  let categoryId: number | null = null;
  if (options.category) {
    categoryId = await resolveId('categories', options.category);
    if (categoryId === null) {
      exitWithError(`Unknown category: ${options.category}`);
    }
  }

  let tagIds: number[] = [];
  if (options.tags) {
    const tagResult = await resolveIds('tags', options.tags);
    if (tagResult.unresolved.length > 0) {
      exitWithError(`Unknown tag(s): ${tagResult.unresolved.join(', ')}`);
    }
    tagIds = tagResult.ids;
  }

  const tipo = mapTypeToApi(options.type ?? 'expense');
  const isReconciled = !options.pending;
  const now = new Date();
  const dateStr = options.date ?? toLocalDateString(now);
  if (!isCalendarDate(dateStr)) {
    exitWithError('Invalid date. Use YYYY-MM-DD (e.g., 2026-10-03).');
  }
  const { startDate: monthStart, endDate: monthEnd } = getCurrentMonthRange();
  const expenseNeedsNegativeValue = tipo === 'd';
  const finalValue = expenseNeedsNegativeValue ? -Math.abs(value) : Math.abs(value);
  const agenda = parseRecurrence(options);

  // Credit card accounts reject the payload unless dataCompetencia is present.
  // Regular accounts already work without it, so only cards get the extra field.
  const account = await fetchAccountById(accountId);
  if (!account) {
    logger.warning(`Account ${accountId} was not found in the account list. Creating the entry without the credit card fields.`);
  }
  const isCardAccount = account ? isCreditCard(account) : false;
  if (options.invoice && !isCardAccount) {
    exitWithError('--invoice only applies to credit card accounts.');
  }

  // Card purchases belong to an open invoice: the web app sends the purchase
  // date as dataCompetencia, the invoice due date as dataPrevista, and leaves
  // them unreconciled. Sending the purchase date as dataPrevista pins them
  // to the nearest (often already closed) invoice instead (#17).
  const cardDueDate = account && isCardAccount
    ? await resolveCardDueDate(account, dateStr, options.invoice)
    : null;
  const entryReconciled = cardDueDate ? false : isReconciled;

  const payload: CreateEntryPayload = {
    descricao: options.description,
    tipo,
    status: {
      confirmado: true,
      conciliado: entryReconciled,
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
    conciliado: entryReconciled,
    dataEfetiva: cardDueDate ? null : dateStr,
    ...(isCardAccount && { dataCompetencia: dateStr }),
    dataPrevista: cardDueDate ?? dateStr,
    valorEfetivo: cardDueDate ? null : finalValue,
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
  const statusDisplay = ENTRY_STATUS_LABELS[String(response.status)];
  console.log(`  ${chalk.gray('Status:')} ${statusDisplay ? formatStatus(statusDisplay) : chalk.gray(String(response.status))}`);
  if (agenda) {
    const intervalLabels: Record<string, string> = { d: 'daily', w: 'weekly', M: 'monthly', y: 'yearly' };
    const timesLabel = agenda.quantidade === -1 ? 'infinite' : `${agenda.quantidade} times`;
    console.log(`  ${chalk.gray('Recurrence:')} ${intervalLabels[agenda.intervalo]} (every ${agenda.frequencia}, ${timesLabel})`);
  }
}
