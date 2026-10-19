// Credit Card Types
/** An entry of an invoice. Only the first fields are known for sure; the
 * others are read when present (the web app's card reconciliation sorts
 * them by dataCompetencia). */
export interface CardInvoiceEntry {
  id: number | string;
  descricao: string;
  valor: number;
  /** Purchase date. */
  data: string;
  categoria?: number;
  parcela?: string;
  status?: string;
  /** d expense, r income, t transfer, p invoice payment (dogfood 2026-10-19). */
  tipo?: 'd' | 'r' | 't' | 'p';
  conta?: number;
  /** The other side of a payment (checking account). */
  contaT?: number;
  transferencia?: number;
  dataPrevista?: string;
  dataCompetencia?: string;
  agendaId?: number;
  tags?: number[];
  observacoes?: string;
  ndocumento?: string;
  plastico?: number;
  /** Present on closed invoices. */
  fatura?: number;
}

export interface CardInvoiceResponse {
  lancamentos: CardInvoiceEntry[];
  vencimento: string;
  fechamento: string;
  /** Bill total (same as resumo.totalFatura); not the sum of lancamentos when
   * a payment (tipo p) is listed among them. */
  valor: number;
  resumo?: {
    totalFatura?: number;
    totalPagar?: number;
    pagamentos?: number;
    valorFaturaAnterior?: number;
  };
  /** Present when the invoice is closed. */
  id?: number;
}

/** One future installment. The real API returns these as a bare array from
 * GET /v1/cartoes/:id/parcelasFuturas (same shape as invoice items); it does
 * not wrap them in { parcelas } and has no parcelasRestantes. */
interface CardFutureInstallment {
  id: number | string;
  descricao: string;
  valor: number;
  data: string;
  parcela: string;
  /** Invented by older mocks; the real API does not send this. */
  parcelasRestantes?: number;
  categoria?: number;
  agendaId?: number;
  status?: string;
  tipo?: 'd' | 'r' | 't' | 'p';
}

/**
 * Real API: bare array. Older mocks / docs: { parcelas, total }.
 * normalizeCardInstallments accepts both.
 */
export type CardFutureResponse =
  | CardFutureInstallment[]
  | { parcelas: CardFutureInstallment[]; total?: number };

export interface NormalizedCardEntry {
  id: number | string;
  description: string;
  /** Purchase date (the item's data), not the due date. */
  date: string;
  /** Invoice due date: the date entries list shows for this item. */
  dueDate: string;
  competenceDate: string;
  value: number;
  categoryId: number | null;
  installment: string | null;
}

export interface NormalizedCardInstallment {
  id: number | string;
  description: string;
  date: string;
  value: number;
  installment: string;
  remaining: number;
  categoryId: number | null;
}
