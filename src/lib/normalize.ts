import type { CategoriesResponse, AccountsResponse, TagsResponse, NormalizedCategory, NormalizedAccount, NormalizedCard, NormalizedTag, NormalizedEntry, Entry, EntryRepetition, EntryStatus, CardInvoiceResponse, CardFutureResponse, NormalizedCardEntry, NormalizedCardInstallment } from '../types/index.js';

function mapCategoryType(tipo: 'd' | 'r' | 't'): 'expense' | 'income' | 'transfer' {
  const typeMap: Record<string, 'expense' | 'income' | 'transfer'> = {
    d: 'expense',
    r: 'income',
    t: 'transfer',
  };
  return typeMap[tipo] ?? 'expense';
}

export function normalizeCategories(response: CategoriesResponse): NormalizedCategory[] {
  return response.items.map((cat) => ({
    id: cat.id,
    name: cat.nome,
    type: mapCategoryType(cat.tipo),
    active: cat.status,
    system: cat.sistema,
  }));
}

export function normalizeAccounts(response: AccountsResponse): NormalizedAccount[] {
  return response.items.map((acc) => ({
    id: acc.id,
    name: acc.nome,
    type: acc.tipo,
    bank: acc.banco?.nome ?? null,
    balance: acc.saldoUltimoExtrato ?? acc.saldoInicial ?? 0,
    active: acc.status,
    closed: acc.encerrada,
  }));
}

/**
 * Accounts plus the card settings the web app's card form edits (md.js):
 * limite, fechamento (closing, in days before the due date), contada (the
 * account that pays the invoice). No balance: for a card it is the Open
 * Finance statement figure (saldoUltimoExtrato), not what is owed.
 */
export function normalizeCards(response: AccountsResponse): NormalizedCard[] {
  return normalizeAccounts(response).map(({ balance: _balance, ...normalized }, i) => {
    const card = response.items[i];
    const nextDueDate = card.proximoVencimento?.slice(0, 10) ?? null;
    return {
      ...normalized,
      limit: card.limite ?? null,
      dueDay: nextDueDate ? Number.parseInt(nextDueDate.slice(8, 10), 10) : null,
      nextDueDate,
      nextClosingDate: card.proximoFechamento?.slice(0, 10) ?? null,
      closingDaysBeforeDue: card.fechamento ?? null,
      paymentAccountId: card.contada ?? null,
    };
  });
}

export function normalizeTags(response: TagsResponse): NormalizedTag[] {
  return response.map((tag) => ({
    id: tag.id,
    name: tag.nome,
    color: `#${tag.cor}`,
    active: tag.status,
  }));
}

/**
 * The API labels an entry conciliado, confirmado (confirmed, not reconciled -
 * what `--confirmed` creates), pendente (not confirmed, planned date today or
 * earlier - what `-p` creates) or agendado (not confirmed, future date; `-p`
 * with a future date). These are the four states `-s` filters on. Card
 * purchases only have conciliado / nconciliado (unreconciled), which the web
 * app reports as Confirmado.
 */
export const ENTRY_STATUS_LABELS: Record<string, EntryStatus> = {
  conciliado: 'reconciled',
  confirmado: 'confirmed',
  nconciliado: 'confirmed',
  pendente: 'pending',
  agendado: 'scheduled',
};

/**
 * A label outside the table is 'unknown', not a guess: the old 'pending'
 * fallback hid 'confirmado' until #71 (Jardinagem 2026-10-19). The raw label
 * is in entries show --raw.
 */
function mapEntryStatus(status: string | undefined): EntryStatus {
  return status !== undefined && Object.hasOwn(ENTRY_STATUS_LABELS, status) ? ENTRY_STATUS_LABELS[status] : 'unknown';
}

function mapEntryType(entry: Entry): NormalizedEntry['type'] {
  // Invoice projections (faturas: true) have no tipo; treating them as expense
  // double-counts when the card is also in the filter. Flag them explicitly.
  if (entry.projecaoFatura != null) return 'invoice';
  // Card invoice payment (moves money from the checking account to the card).
  // Not income/expense: it has contaT/transferencia like a transfer.
  if (entry.tipo === 'p') return 'payment';
  return mapCategoryType(entry.tipo ?? 'd');
}

/** The web app's Repetição: no parcela = única, "fixa" = fixa, "2/6" = parcelada. */
function mapRepetition(parcela: string | undefined): EntryRepetition {
  if (!parcela) return 'single';
  return parcela === 'fixa' ? 'fixed' : 'installment';
}

export function normalizeEntry(entry: Entry): NormalizedEntry {
  return {
    id: entry.id != null && entry.id !== '' ? entry.id : `invoice:${entry.projecaoFatura}`,
    description: entry.descricao,
    // The planned date is what the list's date range filters on (and what
    // the web app shows); data can differ, e.g. on card purchases.
    date: (entry.dataPrevista ?? entry.data).slice(0, 10),
    value: entry.valor,
    type: mapEntryType(entry),
    status: mapEntryStatus(entry.status),
    accountId: entry.conta,
    categoryId: entry.categoria ?? null,
    installment: entry.parcela ?? null,
    repetition: mapRepetition(entry.parcela),
    seriesId: entry.agendaId ?? null,
    effectiveDate: entry.dataEfetiva?.slice(0, 10) ?? null,
    competenceDate: entry.dataCompetencia?.slice(0, 10) ?? null,
    transferAccountId: entry.contaT ?? null,
    tagIds: entry.tags ?? [],
    notes: entry.observacoes ?? '',
    documentNumber: entry.ndocumento || null,
  };
}

export function normalizeEntries(entries: Entry[]): NormalizedEntry[] {
  return entries.map(normalizeEntry);
}

/**
 * date is the invoice due date (dataPrevista ?? vencimento), the same rule as
 * entries list, so one item has one date in both commands (Filipe, dogfood
 * 2026-10-19). dueDate repeats it for compatibility; purchaseDate is the
 * item's data (e.g. 2025-11-19 for an installment 12/18).
 */
export function normalizeCardEntries(response: CardInvoiceResponse): NormalizedCardEntry[] {
  return response.lancamentos.map((entry) => {
    const dueDate = (entry.dataPrevista ?? response.vencimento).slice(0, 10);
    return {
      id: entry.id,
      description: entry.descricao,
      date: dueDate,
      dueDate,
      purchaseDate: entry.data.slice(0, 10),
      competenceDate: (entry.dataCompetencia ?? entry.data).slice(0, 10),
      value: entry.valor,
      categoryId: entry.categoria ?? null,
      installment: entry.parcela ?? null,
    };
  });
}

/** Remaining installments including the current one: "13/18" → 6. */
function remainingFromInstallment(parcela: string | undefined): number {
  const match = parcela?.match(/^(\d+)\/(\d+)$/);
  if (!match) return 0;
  return Number(match[2]) - Number(match[1]) + 1;
}

/**
 * The real API returns a bare array from parcelasFuturas; older mocks wrapped
 * it in { parcelas }. Accept both. Derive remaining from "N/M" when the API
 * omits parcelasRestantes (it always does on the real endpoint).
 */
export function normalizeCardInstallments(response: CardFutureResponse): NormalizedCardInstallment[] {
  const items = Array.isArray(response) ? response : (response.parcelas ?? []);
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    id: item.id,
    description: item.descricao,
    date: item.data,
    value: item.valor,
    installment: item.parcela,
    remaining: item.parcelasRestantes ?? remainingFromInstallment(item.parcela),
    categoryId: item.categoria ?? null,
  }));
}
