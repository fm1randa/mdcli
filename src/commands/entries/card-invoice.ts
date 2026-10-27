import { fetchCardInvoice, fetchFirstInvoiceDate } from '../../lib/api.js';
import { t } from '../../lib/i18n/index.js';
import { addInterval, calendarDay, dueDateInMonth, parseInvoiceMonth, shiftDueDate } from '../../lib/dates.js';
import type { Account, EntryAgenda } from '../../types/index.js';

const MAX_INVOICE_STEPS = 24;

/**
 * The due date (YYYY-MM-DD) the card's invoices are counted from. This file
 * is the only place that reads proximoVencimento (the ESLint rule
 * local/no-due-anchor-fallback bans any read of it elsewhere), through two
 * exports with two rules for a card without one:
 * - cardDueAnchor (creating and listing card entries) takes the API's first
 *   invoice date (GET primeiraFatura) instead, like a new card on the web.
 *   Before this, cards invoice --month assumed day 10, cards invoice and
 *   entries list asked primeiraFatura, and entries create refused
 *   (Jardinagem 2026-10-21).
 * - ownDueDate (the Import) has no fallback, and the Import fails.
 * test/eslint-local-rules.test.ts pins these two as the only readers.
 */
export async function cardDueAnchor(account: Account): Promise<string> {
  return (account.proximoVencimento ?? (await fetchFirstInvoiceDate(account.id))).slice(0, 10);
}

/**
 * The card's own proximoVencimento (YYYY-MM-DD), or null when it has no valid
 * one. No primeiraFatura fallback: the Import reconciles against the current
 * invoice only, like the web (carregarFatura(id, proximoVencimento)), so a
 * card without one fails the Import (decision of 2026-10-23, PR #115).
 */
export function ownDueDate(account: Account): string | null {
  return calendarDay(account.proximoVencimento);
}

/**
 * Due date of the invoice a card purchase belongs to. With --invoice the user
 * picks it; otherwise walk from the card's next due date using each invoice's
 * real closing date, since closing days drift by a day or two between months.
 * Every step is an offset from the anchor, so a clamped day (31 -> Feb 28)
 * never carries into later months.
 */
export async function resolveCardDueDate(account: Account, purchaseDate: string, invoice?: string): Promise<string> {
  if (invoice) parseInvoiceMonth(invoice);

  const anchor = await cardDueAnchor(account);

  if (invoice) {
    return dueDateInMonth(invoice, anchor);
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
  throw new Error(t('errorInvoiceNotFound', purchaseDate));
}

/**
 * Due date of the invoice the web app's entry form puts a purchase on when
 * the entry moves to a card (mdb.js, controller sf, tt/Dt): from the card's
 * next due date, step a month at a time (moment's add, so a clamped day
 * stays clamped) while it is before the date; then the first of that due
 * date and the next one whose closing (due date minus `fechamento` days) is
 * after the date. Never an invoice before the next due date. Unlike
 * resolveCardDueDate, no invoice is read. For an installment series that
 * starts past installment 1, the date is moved to that installment first.
 */
export async function formCardDueDate(card: Account, date: string, agenda?: EntryAgenda): Promise<string> {
  const from = agenda && agenda.quantidade > 1 && (agenda.inicial ?? 1) > 1 && isInterval(agenda.intervalo)
    ? addInterval(date, ((agenda.inicial ?? 1) - 1) * agenda.frequencia, agenda.intervalo)
    : date;
  let due = await cardDueAnchor(card);
  while (due < from) due = shiftDueDate(due, 1);
  const closing = addInterval(due, -(card.fechamento ?? 0), 'd');
  return from < closing ? due : shiftDueDate(due, 1);
}

// moment's add ignores a unit it does not know, so the date stays put.
function isInterval(value: string): value is 'd' | 'w' | 'M' | 'y' {
  return ['d', 'w', 'M', 'y'].includes(value);
}

