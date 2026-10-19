import { ENTRY_STATUS_LABELS } from '../../lib/normalize.js';
import chalk from 'chalk';
import { logger } from '../../utils/logger.js';
import { exitWithError } from '../../utils/action.js';
import { createEntry, fetchAccountById, isCreditCard } from '../../lib/api.js';
import { resolveId, resolveIds } from '../../lib/aliases.js';
import { resolveEntryCategory } from './category.js';
import type { CreateEntryPayload, CreateEntryResponse } from '../../types/index.js';
import { formatCurrency, formatStatus } from './format.js';
import { getCurrentMonthRange, isCalendarDate, toLocalDateString } from '../../lib/dates.js';
import { resolveCardDueDate } from './card-invoice.js';
import { defaultTransferCategory, resolveTransferDestination } from './create-transfer.js';
import { INTERVAL_LABELS, parseSchedule, type Schedule, type ScheduleOptions } from './schedule.js';

interface CreateOptions extends ScheduleOptions {
  account: string;
  description: string;
  value: string;
  type?: string;
  toAccount?: string;
  category?: string;
  date?: string;
  tags?: string;
  notes?: string;
  pending?: boolean;
  scheduled?: boolean;
  invoice?: string;
  json?: boolean;
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

/** Checks that need no API call, so a bad command never reaches the network. */
function checkOptions(options: CreateOptions, tipo: 'd' | 'r' | 't'): void {
  if (tipo === 't' && !options.toAccount) {
    exitWithError('A transfer needs a destination account. Use --to-account <id|alias> (--account is the origin).');
  }
  if (tipo !== 't' && options.toAccount) {
    exitWithError('--to-account only applies to transfers (-T transfer).');
  }
  if (tipo !== 't' && !options.category) {
    exitWithError(
      'A category is required to create an entry. Use -c, --category <id|alias>. See available categories with: mdcli categories list'
    );
  }
  if (options.scheduled && options.pending) {
    exitWithError('Use either --scheduled or --pending, not both.');
  }
}

async function resolveTags(tags: string | undefined): Promise<number[]> {
  if (!tags) return [];
  const tagResult = await resolveIds('tags', tags);
  if (tagResult.unresolved.length > 0) {
    exitWithError(`Unknown tag(s): ${tagResult.unresolved.join(', ')}`);
  }
  return tagResult.ids;
}

export async function createAction(options: CreateOptions): Promise<void> {
  const value = Number(options.value);
  if (Number.isNaN(value)) {
    exitWithError('Invalid value. Must be a number.');
  }

  const tipo = mapTypeToApi(options.type ?? 'expense');
  checkOptions(options, tipo);

  const now = new Date();
  const dateStr = options.date ?? toLocalDateString(now);
  if (!isCalendarDate(dateStr)) {
    exitWithError('Invalid date. Use YYYY-MM-DD (e.g., 2026-10-03).');
  }
  // Only income is positive: the web app sends expenses and transfers (from
  // the origin side) as negative values.
  const finalValue = tipo === 'r' ? Math.abs(value) : -Math.abs(value);
  const schedule = parseSchedule(options, finalValue, dateStr);

  const accountId = await resolveId('accounts', options.account);
  if (accountId === null) {
    exitWithError(`Unknown account: ${options.account}`);
  }

  let categoryId: number | null = options.category ? await resolveEntryCategory(options.category) : null;
  const tagIds = await resolveTags(options.tags);

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
  if (options.scheduled && isCardAccount) {
    exitWithError('--scheduled does not apply to credit card purchases: they always go to an invoice.');
  }

  const destinationId = tipo === 't'
    ? await resolveTransferDestination(account, accountId, options.toAccount ?? '')
    : null;
  if (destinationId !== null && categoryId === null) {
    categoryId = await defaultTransferCategory();
  }

  // Card purchases belong to an open invoice: the web app sends the purchase
  // date as dataCompetencia, the invoice due date as dataPrevista, and leaves
  // them unreconciled. Sending the purchase date as dataPrevista pins them
  // to the nearest (often already closed) invoice instead (#17).
  const cardDueDate = account && isCardAccount
    ? await resolveCardDueDate(account, dateStr, options.invoice)
    : null;

  // Confirmado and conciliado both off is the web app's "agendado": no
  // effective date or value yet (filling them in is what confirms an entry).
  const confirmed = !options.scheduled;
  const reconciled = confirmed && !cardDueDate && !options.pending;
  const hasEffective = confirmed && !cardDueDate;
  const total = schedule?.total ?? finalValue;
  // For installments the effective value is the first installment's.
  const effectiveValue = schedule?.parcelas?.[0].valor ?? finalValue;
  const { startDate: monthStart, endDate: monthEnd } = getCurrentMonthRange();

  const payload: CreateEntryPayload = {
    descricao: options.description,
    tipo,
    status: {
      confirmado: confirmed,
      conciliado: reconciled,
    },
    exibirCp: true,
    exibirCr: true,
    automatico: false,
    lembrete: 0,
    anexos: [],
    ...(schedule && { agenda: schedule.agenda }),
    ...(schedule?.parcelas && { parcelas: schedule.parcelas }),
    '#': null,
    // A transfer names both accounts and no conta, as the web app sends it.
    ...(destinationId === null
      ? { conta: accountId.toString() }
      : { contaOrigem: accountId, contaDestino: destinationId }),
    inicio: monthStart,
    fim: monthEnd,
    i: 'm',
    valor: total,
    data: now.toISOString(),
    base: null,
    categoria: categoryId,
    metaEconomia: null,
    observacoes: options.notes ?? '',
    tags: tagIds,
    transferencia: destinationId !== null,
    conciliado: reconciled,
    dataEfetiva: hasEffective ? dateStr : null,
    ...(isCardAccount && { dataCompetencia: dateStr }),
    dataPrevista: cardDueDate ?? dateStr,
    valorEfetivo: hasEffective ? effectiveValue : null,
    valorPrevisto: total,
    // The destination half of a same-currency transfer mirrors the origin.
    ...(destinationId !== null && {
      valorT: Math.abs(total),
      valorPrevistoT: Math.abs(total),
      valorEfetivoT: hasEffective ? Math.abs(total) : null,
    }),
  };

  const response = await createEntry(payload);
  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
    return;
  }
  reportCreate(response, schedule, destinationId);
}

function describeSchedule(schedule: Schedule): string {
  const { agenda, parcelas } = schedule;
  const every = `${INTERVAL_LABELS[agenda.intervalo]}, every ${agenda.frequencia}`;
  if (!parcelas) {
    const timesLabel = agenda.quantidade === -1 ? 'infinite' : `${agenda.quantidade} times`;
    return `${every}, ${timesLabel}`;
  }
  const first = parcelas[0].valor;
  const rest = parcelas[parcelas.length - 1].valor;
  const split = first === rest
    ? `${parcelas.length}x ${formatCurrency(rest)}`
    : `1x ${formatCurrency(first)} + ${parcelas.length - 1}x ${formatCurrency(rest)}`;
  const start = agenda.inicial > 1 ? `, starting at installment ${agenda.inicial}` : '';
  return `${split} (${every}${start})`;
}

function reportCreate(response: CreateEntryResponse, schedule: Schedule | undefined, destinationId: number | null): void {
  logger.success(`Entry created successfully!`);
  console.log(`  ${chalk.gray('ID:')} ${response.id}`);
  console.log(`  ${chalk.gray('Description:')} ${response.descricao}`);
  console.log(`  ${chalk.gray('Value:')} ${formatCurrency(response.valor)}`);
  console.log(`  ${chalk.gray('Date:')} ${response.data}`);
  if (destinationId !== null) {
    console.log(`  ${chalk.gray('To account:')} ${destinationId}`);
  }
  const statusDisplay = ENTRY_STATUS_LABELS[String(response.status)];
  console.log(`  ${chalk.gray('Status:')} ${statusDisplay ? formatStatus(statusDisplay) : chalk.gray(String(response.status))}`);
  if (schedule) {
    const label = schedule.parcelas ? 'Installments:' : 'Recurrence:';
    console.log(`  ${chalk.gray(label)} ${describeSchedule(schedule)}`);
  }
}
