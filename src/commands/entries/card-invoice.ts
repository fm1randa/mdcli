import { fetchCardInvoice, fetchFirstInvoiceDate } from '../../lib/api.js';
import { dueDateInMonth, parseInvoiceMonth, shiftDueDate } from '../../lib/dates.js';
import type { Account } from '../../types/index.js';

const MAX_INVOICE_STEPS = 24;

/**
 * The due date (YYYY-MM-DD) the card's invoices are counted from, and the
 * only place that reads proximoVencimento for that (the ESLint rule
 * local/no-due-anchor-fallback bans any read of it elsewhere). A card without one, like a new card,
 * takes the API's first invoice date (GET primeiraFatura) instead. Before
 * this, cards invoice --month assumed day 10, cards invoice and entries list
 * asked primeiraFatura, and entries create refused (Jardinagem 2026-10-21).
 */
export async function cardDueAnchor(account: Account): Promise<string> {
  return (account.proximoVencimento ?? (await fetchFirstInvoiceDate(account.id))).slice(0, 10);
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
  throw new Error(`Could not find the invoice for ${purchaseDate}. Pass it explicitly with --invoice YYYY-MM.`);
}
