import { fetchCardInvoice } from '../../lib/api.js';
import { dueDateInMonth, parseInvoiceMonth, shiftDueDate } from '../../lib/dates.js';
import type { Account } from '../../types/index.js';

const MAX_INVOICE_STEPS = 24;

/**
 * Due date of the invoice a card purchase belongs to. With --invoice the user
 * picks it; otherwise walk from the card's next due date using each invoice's
 * real closing date, since closing days drift by a day or two between months.
 * Every step is an offset from the anchor, so a clamped day (31 -> Feb 28)
 * never carries into later months.
 */
export async function resolveCardDueDate(account: Account, purchaseDate: string, invoice?: string): Promise<string> {
  const anchor = account.proximoVencimento?.slice(0, 10);

  if (invoice) parseInvoiceMonth(invoice);

  if (!anchor) {
    throw new Error(`Card ${account.id} has no next due date, so its invoice due day is unknown.`);
  }

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
