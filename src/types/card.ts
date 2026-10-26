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

/**
 * The invoice summary the web app shows next to the items. Field names are the
 * ones the card screen copies from `fatura.resumo` (md.js, `resumo.setParams`);
 * the web takes the limit from the card (`cartao.limite`), not from here.
 * Amounts follow the API's signs (an expense bill is negative). Any field may be
 * missing, so the CLI shows only what comes back.
 */
interface CardInvoiceSummary {
  vencimento?: string;
  fechamento?: string;
  /** Previous invoice's bill. */
  valorFaturaAnterior?: number;
  /** Confirmed payments of the invoice. */
  pagamentosConf?: number;
  /** Scheduled (not yet confirmed) payments. */
  pagamentosAgen?: number;
  totalFatura?: number;
  totalPagar?: number;
  totalFaturaAtual?: number;
  totalFixo?: number;
  /** Reconciled and unreconciled parts of the bill. */
  conciliado?: number;
  nconciliado?: number;
  receitas?: number;
  despesas?: number;
  transferencias?: number;
  /** Available credit limit. */
  disponivel?: number;
  /** Seen in a dogfood probe (2026-10-19); not read by the web app. */
  pagamentos?: number;
}

export interface CardInvoiceResponse {
  lancamentos: CardInvoiceEntry[];
  vencimento: string;
  fechamento: string;
  /** Bill total (same as resumo.totalFatura); not the sum of lancamentos when
   * a payment (tipo p) is listed among them. */
  valor: number;
  resumo?: CardInvoiceSummary;
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
  /** Invoice due date, the same date entries list --json shows for this item. */
  date: string;
  /** Same as date; kept so scripts written against #83 keep working. */
  dueDate: string;
  /** The item's data: when the purchase was made (e.g. a year earlier for 12/18). */
  purchaseDate: string;
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

/**
 * The invoice summary in `cards invoice --json --summary` (Filipe, option B,
 * 2026-10-19). Amounts are R$ with the API's signs (reconciled/unreconciled
 * are the R$ parts of the bill, not counts). A field the API leaves out is
 * null, never a guessed zero; limit comes from the card, as in the web.
 */
export interface NormalizedInvoiceSummary {
  /** Set only on closed invoices (the API sends id only then). */
  id: number | null;
  closed: boolean;
  dueDate: string | null;
  closingDate: string | null;
  previousInvoice: number | null;
  paid: number | null;
  scheduledPayments: number | null;
  expenses: number | null;
  income: number | null;
  total: number | null;
  toPay: number | null;
  reconciled: number | null;
  unreconciled: number | null;
  limit: number | null;
  available: number | null;
}

/**
 * A plastic (plastico) of a credit card: a physical card a purchase is made
 * with, as GET /v1/cadastros/plasticos lists them (the web app's
 * cadastrosDatasource "plasticos"). tipo T is the holder's (titular).
 */
export interface CardPlastic {
  id: number;
  /** The credit card Account. */
  conta: number;
  tipo: string;
  nome: string;
  titular?: boolean;
  status?: boolean;
  /** visivel false: hidden from the user, so the web app does not list it. */
  permissoes?: { visivel: boolean };
}
