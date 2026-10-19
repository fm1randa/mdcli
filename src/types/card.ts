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
  tipo?: 'd' | 'r' | 't';
  conta?: number;
  dataPrevista?: string;
  dataCompetencia?: string;
  agendaId?: number;
  tags?: number[];
  observacoes?: string;
  ndocumento?: string;
}

export interface CardInvoiceResponse {
  lancamentos: CardInvoiceEntry[];
  vencimento: string;
  fechamento: string;
  valor: number;
  resumo?: {
    totalFatura?: number;
    totalPagar?: number;
  };
}

interface CardFutureInstallment {
  id: number | string;
  descricao: string;
  valor: number;
  data: string;
  parcela: string;
  parcelasRestantes?: number;
  categoria?: number;
}

export interface CardFutureResponse {
  parcelas: CardFutureInstallment[];
  total?: number;
}

export interface NormalizedCardEntry {
  id: number | string;
  description: string;
  date: string;
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
