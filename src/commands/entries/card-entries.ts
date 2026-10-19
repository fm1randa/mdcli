import { fetchAccounts, fetchAllEntries, fetchCardInvoice, fetchFirstInvoiceDate, isCreditCard } from '../../lib/api.js';
import { shiftDueDate } from '../../lib/dates.js';
import type { Account, CardInvoiceEntry, CreateEntryResponse, EntriesParams, Entry } from '../../types/index.js';
import { isEntryId } from './entry-id.js';

type ListParams = Omit<EntriesParams, 'page' | 'pageSize'>;

// Same bits the API filters on (docs/api-filters.md), applied here to the
// entries read from invoices, which the API did not filter.
const STATUS_BITS: Record<string, number> = { pendente: 1, confirmado: 2, conciliado: 4, agendado: 8 };

const cents = (value: number): number => Math.round(Math.abs(value) * 100);

/** Due dates of the card's invoices that fall within [from, to]. */
async function dueDatesInRange(card: Account, from: string, to: string): Promise<string[]> {
  const anchor = (card.proximoVencimento ?? (await fetchFirstInvoiceDate(card.id))).slice(0, 10);
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
  const statusBit = STATUS_BITS[entry.status];
  if (statusBit && !inMask(params.status, statusBit)) return false;
  const typeBit = entry.tipo === 'r' ? 2 : entry.tipo === 't' ? (entry.valor < 0 ? 4 : 8) : 1;
  // tipoLancamento 0 lists every type on the API (docs/api-filters.md).
  if (params.entryType !== 0 && !inMask(params.entryType, typeBit)) return false;
  const repetitionBit = !entry.parcela ? 1 : entry.parcela === 'fixa' ? 4 : 2;
  if (!inMask(params.repetition, repetitionBit)) return false;
  if (params.categoryIds?.length && !params.categoryIds.includes(entry.categoria ?? -1)) return false;
  if (params.tagIds?.length && !(entry.tags ?? []).some((t) => params.tagIds?.includes(t))) return false;
  if (params.value !== undefined && cents(entry.valor) !== cents(params.value)) return false;
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
  const seen = new Set(listed.map((e) => String(e.id)));
  const fromInvoices: Entry[] = [];
  for (const card of cards) {
    for (const due of await dueDatesInRange(card, params.startDate, params.endDate)) {
      const invoice = await fetchCardInvoice(card.id, due);
      for (const item of invoice.lancamentos ?? []) {
        const entry = toEntry(item, card, due);
        if (seen.has(String(entry.id)) || !matchesFilters(entry, params)) continue;
        seen.add(String(entry.id));
        fromInvoices.push(entry);
      }
    }
  }
  if (fromInvoices.length === 0) return listed;
  const date = (e: Entry): string => (e.dataPrevista ?? e.data).slice(0, 10);
  return [...listed, ...fromInvoices].sort((a, b) => date(a).localeCompare(date(b)));
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
    .filter((e) => e.descricao === card.description && cents(e.valor) === cents(card.value) && isEntryId(e.id))
    .map((e) => Number(e.id));
  if (ids.length === 0) {
    // stderr: stdout stays machine-readable under --json.
    console.error(
      `⚠ The API answered with "${response.id}", which is not an entry ID, and the purchase was not found in the ` +
        `${card.dueDate} invoice. Find its ID with: mdcli cards invoice -a ${card.id} --month ${card.dueDate.slice(0, 7)} --json`
    );
    return response;
  }
  return { ...response, id: Math.max(...ids), occurrenceId: String(response.id) };
}
