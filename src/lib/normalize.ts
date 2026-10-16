import type { CategoriesResponse, AccountsResponse, TagsResponse, NormalizedCategory, NormalizedAccount, NormalizedTag, NormalizedEntry, Entry, CardInvoiceResponse, CardFutureResponse, NormalizedCardEntry, NormalizedCardInstallment } from '../types/index.js';

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
 * what `-p` creates), pendente, or agendado. The CLI calls both confirmado and
 * pendente "pending", as the web app's "Não conciliado" does.
 */
export const ENTRY_STATUS_LABELS: Record<string, 'reconciled' | 'pending' | 'scheduled'> = {
  conciliado: 'reconciled',
  confirmado: 'pending',
  pendente: 'pending',
  agendado: 'scheduled',
};

function mapEntryStatus(status: string): 'reconciled' | 'pending' | 'scheduled' {
  return ENTRY_STATUS_LABELS[status] ?? 'pending';
}

export function normalizeEntries(entries: Entry[]): NormalizedEntry[] {
  return entries.map((entry) => ({
    id: entry.id,
    description: entry.descricao,
    date: entry.data,
    value: entry.valor,
    type: mapCategoryType(entry.tipo ?? 'd'),
    status: mapEntryStatus(entry.status),
    accountId: entry.conta,
    categoryId: entry.categoria ?? null,
    installment: entry.parcela ?? null,
  }));
}

export function normalizeCardEntries(response: CardInvoiceResponse): NormalizedCardEntry[] {
  return response.lancamentos.map((entry) => ({
    id: entry.id,
    description: entry.descricao,
    date: entry.data,
    value: entry.valor,
    categoryId: entry.categoria ?? null,
    installment: entry.parcela ?? null,
  }));
}

export function normalizeCardInstallments(response: CardFutureResponse): NormalizedCardInstallment[] {
  if (!response.parcelas || !Array.isArray(response.parcelas)) {
    return [];
  }
  return response.parcelas.map((item) => ({
    id: item.id,
    description: item.descricao,
    date: item.data,
    value: item.valor,
    installment: item.parcela,
    remaining: item.parcelasRestantes ?? 0,
    categoryId: item.categoria ?? null,
  }));
}
