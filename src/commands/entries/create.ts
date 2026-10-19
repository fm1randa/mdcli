import chalk from 'chalk';
import { logger } from '../../utils/logger.js';
import { exitWithError } from '../../utils/action.js';
import { createEntry, fetchAccountById, isCreditCard } from '../../lib/api.js';
import { resolveId } from '../../lib/aliases.js';
import { resolveTags } from './tags.js';
import { resolveEntryCategory } from './category.js';
import type { CreateEntryPayload, CreateEntryResponse } from '../../types/index.js';
import { describeStatus } from './format.js';
import { formatCurrency } from '../../utils/currency.js';
import { getCurrentMonthRange, isCalendarDate, toLocalDateString } from '../../lib/dates.js';
import { resolveCardDueDate } from './card-invoice.js';
import { withCardEntryId } from './card-entries.js';
import { defaultTransferCategory, resolveTransferDestination } from './create-transfer.js';
import { INTERVAL_LABELS, parseSchedule, type Schedule, type ScheduleOptions } from './schedule.js';
import { parseAmount } from '../../utils/parse.js';
import { buildEntryStatus } from './status.js';

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
  /** Deprecated alias of --pending (#74 shipped it before the status fix). */
  scheduled?: boolean;
  confirmed?: boolean;
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
  if ((options.pending || options.scheduled) && options.confirmed) {
    exitWithError('Use either --pending or --confirmed, not both.');
  }
}

export async function createAction(options: CreateOptions): Promise<void> {
  const value = parseAmount(options.value);
  if (value === undefined) {
    exitWithError(`Invalid value "${options.value}". Use a number like 10, 10.50 or 10,50.`);
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
  const tagIds = options.tags ? await resolveTags(options.tags) : [];

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
  const unconfirmed = Boolean(options.pending || options.scheduled);
  if (options.scheduled) warnScheduledAlias();
  if (isCardAccount && (unconfirmed || options.confirmed)) {
    // The web app has no Confirmado toggle for card purchases, only Conciliado:
    // a purchase sits unreconciled on its invoice until the invoice is paid.
    console.error(
      chalk.yellow('⚠'),
      `Card purchases have no pending or confirmed state: the purchase goes to the invoice unreconciled. ${unconfirmed ? '--pending' : '--confirmed'} was ignored.`
    );
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

  // Status rules (and why) live in status.ts, shared with update.
  const { confirmado, conciliado, effective } = buildEntryStatus(
    { pending: unconfirmed, confirmed: options.confirmed },
    { isCard: Boolean(cardDueDate) }
  );
  const hasEffective = effective === 'set';
  const total = schedule?.total ?? finalValue;
  // For installments the effective value is the first installment's.
  const effectiveValue = schedule?.parcelas?.[0].valor ?? finalValue;
  const { startDate: monthStart, endDate: monthEnd } = getCurrentMonthRange();

  const payload: CreateEntryPayload = {
    descricao: options.description,
    tipo,
    status: { confirmado, conciliado },
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
    conciliado,
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

  const created = await createEntry(payload);
  const response = cardDueDate
    ? await withCardEntryId(created, { id: accountId, dueDate: cardDueDate, description: options.description, value: effectiveValue })
    : created;
  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
    return;
  }
  reportCreate(response, schedule, destinationId);
}

export function warnScheduledAlias(): void {
  console.error(
    chalk.yellow('⚠'),
    '--scheduled is now --pending: both leave Confirmado off; the API shows the entry as scheduled when its date is in the future and as pending otherwise.'
  );
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
  console.log(`  ${chalk.gray('Status:')} ${describeStatus(response.status, response.dataPrevista ?? response.data)}`);
  if (schedule) {
    const label = schedule.parcelas ? 'Installments:' : 'Recurrence:';
    console.log(`  ${chalk.gray(label)} ${describeSchedule(schedule)}`);
  }
}
