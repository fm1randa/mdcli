import { fetchCardInvoice } from '../../../lib/api.js';
import { t } from '../../../lib/i18n/index.js';
import { addInterval, calendarDay, shiftDueDate } from '../../../lib/dates.js';

/** How far back the walk goes, like `resolveCardDueDate`. */
const MAX_EARLIER_INVOICES = 24;
/** Closing days drift a day or two between months; this bounds the guess that skips a request. */
const CLOSING_DRIFT_DAYS = 7;

/**
 * The items of the card's `due` invoice (its `proximoVencimento`) and of every earlier invoice a
 * purchase date falls in. The web reads only the `due` invoice, but once an invoice closes the
 * purchases made before the closing are in it, already imported or reconciled, and the next one
 * would offer a wrong match or a second import (issue #281, divergence authorized by the maintainer).
 * An invoice holds the purchases after the previous closing up to its own `fechamento`, so the walk
 * stops at the first invoice whose closing comes before the earliest purchase.
 */
export async function invoiceItems(cardId: number, due: string, purchaseDates: readonly (string | null)[]): Promise<unknown[]> {
  const load = async (offset: number): Promise<{ items: unknown[]; closing: string | null }> => {
    const dueDate = shiftDueDate(due, offset);
    const invoice = await fetchCardInvoice(cardId, dueDate);
    if (!Array.isArray(invoice.lancamentos)) {
      throw new Error(t('errorInvoiceNoLancamentos', cardId, dueDate));
    }
    return { items: invoice.lancamentos, closing: calendarDay(invoice.fechamento) };
  };

  const current = await load(0);
  const items = [...current.items];
  const earliest = earliestDate(purchaseDates);
  let closing = current.closing;
  for (let offset = -1; offset >= -MAX_EARLIER_INVOICES; offset--) {
    if (earliest === null || closing === null) break;
    // The previous closing is about a month before this one: no request when every purchase is clearly after it.
    if (earliest > addInterval(shiftDueDate(closing, -1), CLOSING_DRIFT_DAYS, 'd')) break;
    const earlier = await load(offset);
    if (earlier.closing === null || earliest > earlier.closing) break;
    items.push(...earlier.items);
    closing = earlier.closing;
  }
  return items;
}

function earliestDate(dates: readonly (string | null)[]): string | null {
  let earliest: string | null = null;
  for (const date of dates) {
    if (date !== null && (earliest === null || date < earliest)) earliest = date;
  }
  return earliest;
}
