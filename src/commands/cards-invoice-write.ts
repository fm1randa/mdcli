import type { Command } from 'commander';
import { logger } from '../utils/logger.js';
import { exitAfterFlush, exitWithError } from '../utils/action.js';
import { promptConfirmation } from '../utils/prompt.js';
import { formatCurrency, roundToCents } from '../utils/currency.js';
import { t } from '../lib/i18n/index.js';
import { calendarDay, dueDateInMonth, isCalendarDate, parseInvoiceMonth, shiftDueDate } from '../lib/dates.js';
import { closeCardInvoice, fetchAccountById, fetchCardInvoice, isCreditCard, reopenCardInvoice } from '../lib/api.js';
import { resolveAccountOrExit } from './account-id.js';
import { resolveCardOrExit } from './card-account.js';
import { cardDueAnchor, ownDueDate } from './entries/card-invoice.js';
import type { Account, CardInvoiceResponse, CloseInvoiceRequest, ReopenInvoiceRequest } from '../types/index.js';

/** -a, --month and --json belong to `cards invoice`; optsWithGlobals() merges them in. */
interface WriteFlags {
  account: string;
  month?: string;
  json?: boolean;
  dryRun?: boolean;
  dangerouslySkipConfirmation?: boolean;
}

interface CloseFlags extends WriteFlags {
  from?: string;
  date?: string;
  /** false with --no-payment. */
  payment: boolean;
}

/**
 * The amount the web's close dialog schedules (mdb.js, PagarFaturaController): the bill plus the
 * payments already scheduled, and 0 when that leaves nothing to pay. It never schedules a second
 * payment for what is already scheduled.
 */
function amountToSchedule(invoice: CardInvoiceResponse): number {
  const left = roundToCents(invoice.valor + (invoice.pagamentosAgendados ?? 0));
  return left < 0 ? left : 0;
}

/** The paying account: --from, or the card's own payment account (contada), like the web's default. */
async function payingAccount(card: Account, from: string | undefined): Promise<number> {
  if (from === undefined) {
    if (card.contada === undefined) exitWithError(t('errorInvoiceCloseNoPayingAccount', card.id));
    return card.contada;
  }
  const id = await resolveAccountOrExit(from);
  const account = await fetchAccountById(id);
  if (!account) exitWithError(t('errorAccountNotFoundById', id));
  if (isCreditCard(account)) exitWithError(t('errorInvoiceClosePaidByCard', id));
  return id;
}

export async function closeInvoiceAction(_options: CloseFlags, command: Command): Promise<void> {
  const options = command.optsWithGlobals<CloseFlags>();
  // The web closes only the card's current invoice (proximoVencimento): there is no month to pick.
  if (options.month !== undefined) exitWithError(t('errorInvoiceCloseMonth'));
  if (options.date !== undefined && !isCalendarDate(options.date)) exitWithError(t('errorInvalidDate'));
  const card = await resolveCardOrExit(options.account);
  // No primeiraFatura fallback: the web closes the proximoVencimento invoice, which a card without one lacks.
  const dueDate = ownDueDate(card);
  if (dueDate === null) exitWithError(t('errorCardNoDueDate', card.id));
  const invoice = await fetchCardInvoice(card.id, dueDate);
  if (invoice.id !== undefined) exitWithError(t('errorInvoiceAlreadyClosed', card.nome, dueDate));

  const body: CloseInvoiceRequest = {
    conta: card.id,
    data: options.date ?? dueDate,
    valor: options.payment ? amountToSchedule(invoice) : 0,
    contaT: String(await payingAccount(card, options.from)),
    // The web dialog's defaults: confirmed, not automatic, reminder 0, no attachments.
    confirmado: true,
    automatico: false,
    vencimento: invoice.vencimento,
    anexos: [],
    lembrete: 0,
  };
  const plan = body.valor === 0
    ? t('invoiceClosePlanNoPayment', card.nome, card.id, dueDate)
    : t('invoiceClosePlan', card.nome, card.id, dueDate, formatCurrency(body.valor), body.contaT, body.data);
  if (!(await allowed(options, plan, body))) return;

  const saved = await closeCardInvoice(card.id, body);
  report(options, t('invoiceCloseDone', card.nome, dueDate), { closed: true, dueDate, request: body, response: saved });
}

export async function reopenInvoiceAction(_options: WriteFlags, command: Command): Promise<void> {
  const options = command.optsWithGlobals<WriteFlags>();
  if (options.month !== undefined) parseInvoiceMonth(options.month);
  const card = await resolveCardOrExit(options.account);
  const anchor = await cardDueAnchor(card);
  // Default: the last closed invoice, the one before the card's current (open) invoice.
  const dueDate = options.month !== undefined ? dueDateInMonth(options.month, anchor) : shiftDueDate(anchor, -1);
  const invoice = await fetchCardInvoice(card.id, dueDate);
  if (invoice.id === undefined) exitWithError(t('errorInvoiceNotClosed', card.nome, dueDate));

  // The web sends the invoice's own vencimento (mdb.js, FaturaController.reabrirFatura).
  const body: ReopenInvoiceRequest = { vencimento: invoice.vencimento };
  if (!(await allowed(options, t('invoiceReopenPlan', card.nome, card.id, calendarDay(invoice.vencimento) ?? dueDate), body))) return;

  await reopenCardInvoice(card.id, body);
  report(options, t('invoiceReopenDone', card.nome, dueDate), { reopened: true, dueDate, request: body });
}

/**
 * Whether to write: --dry-run prints the plan (and the request with --json) and stops; --json never
 * prompts, so it needs --dangerously-skip-confirmation; otherwise the user confirms.
 */
async function allowed(options: WriteFlags, plan: string, body: object): Promise<boolean> {
  if (options.dryRun) {
    if (options.json) console.log(JSON.stringify({ dryRun: true, request: body }, null, 2));
    else logger.info(t('invoiceDryRun', plan));
    return false;
  }
  if (options.json && !options.dangerouslySkipConfirmation) exitWithError(t('errorInvoiceWriteJsonNeedsSkip'));
  if (options.dangerouslySkipConfirmation) return true;
  if (await promptConfirmation(t('confirmInvoiceWrite', plan))) return true;
  logger.info(t('invoiceWriteCancelled'));
  await exitAfterFlush(0);
  return false;
}

function report(options: WriteFlags, done: string, json: object): void {
  if (options.json) {
    console.log(JSON.stringify(json, null, 2));
    return;
  }
  logger.success(done);
}
