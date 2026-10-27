import { fetchAccounts, fetchAllEntries, fetchCardInvoice, isCreditCard } from '../../lib/api.js';
import { t } from '../../lib/i18n/index.js';
import { shiftDueDate } from '../../lib/dates.js';
import type { Account, CardInvoiceEntry, CreateEntryResponse, EntriesParams, Entry } from '../../types/index.js';
import { isEntryId } from './entry-id.js';
import { cardDueAnchor } from './card-invoice.js';
import { statusBit, typeBit } from './filters.js';
import { toCents } from '../../utils/currency.js';
import { parseInteger } from '../../utils/parse.js';
import { mapConcurrent } from '../../utils/concurrency.js';

// Invoice requests in flight at once for entries list/summary: enough to cut
// the wait, few enough not to hammer the API.
const INVOICE_CONCURRENCY = 4;

type ListParams = Omit<EntriesParams, 'page' | 'pageSize'>;


/** Due dates of the card's invoices that fall within [from, to]. */
async function dueDatesInRange(card: Account, from: string, to: string): Promise<string[]> {
  const anchor = await cardDueAnchor(card);
  // shiftDueDate clamps the anchor's day in every month (31 -> Feb 28).
  const base = `${from.slice(0, 7)}-${anchor.slice(8, 10)}`;
  const dates: string[] = [];
  for (let offset = 0; ; offset++) {
    const due = shiftDueDate(base, offset);
    if (due.slice(0, 7) > to.slice(0, 7)) return dates;
    if (due >= from && due <= to) dates.push(due);
  }
}

/** An invoice item in the statement list's shape, filling what the invoice may leave out. */
function toEntry(item: CardInvoiceEntry, card: Account, dueDate: string): Entry {
  return {
    ...item,
    conta: item.conta ?? card.id,
    tipo: item.tipo ?? (item.valor > 0 ? 'r' : 'd'),
    // A card purchase is confirmed and unreconciled until its invoice is paid.
    status: item.status ?? 'confirmado',
    dataPrevista: item.dataPrevista ?? dueDate,
    dataCompetencia: item.dataCompetencia ?? item.data,
  } as Entry;
}

function inMask(mask: number | undefined, bit: number): boolean {
  return mask === undefined || (mask & bit) !== 0;
}

function matchesFilters(entry: Entry, params: ListParams): boolean {
  // The same bits the API filters the statement on (filters.ts), since it
  // did not filter the invoices.
  const status = statusBit(entry.status);
  if (status && !inMask(params.status, status)) return false;
  // tipoLancamento 0 lists every type on the API (docs/api-filters.md).
  if (params.entryType !== undefined && params.entryType !== 0 && !inMask(params.entryType, typeBit(entry))) return false;
  const repetitionBit = !entry.parcela ? 1 : entry.parcela === 'fixa' ? 4 : 2;
  if (!inMask(params.repetition, repetitionBit)) return false;
  if (params.categoryIds?.length && !params.categoryIds.includes(entry.categoria ?? -1)) return false;
  if (params.tagIds?.length && !(entry.tags ?? []).some((t) => params.tagIds?.includes(t))) return false;
  if (params.value !== undefined && toCents(entry.valor) !== toCents(params.value)) return false;
  if (params.keywords) {
    const text = `${entry.descricao} ${entry.observacoes ?? ''}`.toLowerCase();
    if (!text.includes(params.keywords.toLowerCase())) return false;
  }
  return true;
}

/**
 * Entries for `entries list`/`summary`. The statement list (finalidade 1,
 * the web app's Extrato) leaves out card purchases, and the web app never
 * reads them from it: its card screens (Fatura, card reconciliation) load
 * each invoice. So for every card among the accounts, the purchases of the
 * invoices due within the range are added, filtered like the API would,
 * skipping any the statement list already returned.
 */
export async function fetchListEntries(params: ListParams): Promise<Entry[]> {
  const listed = await fetchAllEntries(params);
  const { items } = await fetchAccounts();
  const cards = items.filter((a) => params.accountIds.includes(a.id) && isCreditCard(a));
  // When the card is also in -a, its purchases come from the invoices below.
  // Drop the statement's projecaoFatura for that card so the bill is not
  // counted twice (dogfood 2026-10-19 / regression of #78 over #72).
  const cardIds = new Set(cards.map((c) => c.id));
  const withoutDupedInvoices = listed.filter(
    (e) => e.projecaoFatura == null || !cardIds.has(e.projecaoFatura)
  );
  // A year on two cards is 24 invoices: fetch them a few at a time instead of
  // one after the other (Jardinagem 2026-10-21). Results come back in card
  // and due-date order, so the dedupe below keeps the same entry as before.
  const dueDates = await mapConcurrent(cards, INVOICE_CONCURRENCY, (card) =>
    dueDatesInRange(card, params.startDate, params.endDate)
  );
  const wanted = cards.flatMap((card, i) => dueDates[i].map((due) => ({ card, due })));
  const invoices = await mapConcurrent(wanted, INVOICE_CONCURRENCY, ({ card, due }) => fetchCardInvoice(card.id, due));
  const seen = new Set(withoutDupedInvoices.map((e) => String(e.id)));
  const fromInvoices: Entry[] = [];
  wanted.forEach(({ card, due }, i) => {
    for (const item of invoices[i].lancamentos ?? []) {
      const entry = toEntry(item, card, due);
      if (seen.has(String(entry.id)) || !matchesFilters(entry, params)) continue;
      seen.add(String(entry.id));
      fromInvoices.push(entry);
    }
  });
  if (fromInvoices.length === 0) return withoutDupedInvoices;
  const date = (e: Entry): string => (e.dataPrevista ?? e.data).slice(0, 10);
  return [...withoutDupedInvoices, ...fromInvoices].sort((a, b) => date(a).localeCompare(date(b)));
}

/**
 * A card purchase comes back from POST with an occurrence ID (see
 * entry-id.ts); its entry ID only shows up in the invoice. Take the purchase
 * with that description and value there, the newest (highest ID) if an older
 * identical one exists. The CLI's answer keeps the API's ID as occurrenceId.
 */
export async function withCardEntryId(
  response: CreateEntryResponse,
  card: { id: number; dueDate: string; description: string; value: number }
): Promise<CreateEntryResponse & { occurrenceId?: string }> {
  if (isEntryId(response.id)) return response;
  const invoice = await fetchCardInvoice(card.id, card.dueDate);
  const ids = (invoice.lancamentos ?? [])
    .filter((e) => e.descricao === card.description && toCents(e.valor) === toCents(card.value) && isEntryId(e.id))
    .flatMap((e) => {
      const id = typeof e.id === 'number' ? e.id : parseInteger(e.id);
      return id === undefined ? [] : [id];
    });
  if (ids.length === 0) {
    // stderr: stdout stays machine-readable under --json.
    console.error(
      t('warningCardEntryIdNotFound', String(response.id), card.dueDate, card.id, card.dueDate.slice(0, 7))
    );
    return response;
  }
  return { ...response, id: Math.max(...ids), occurrenceId: String(response.id) };
}
