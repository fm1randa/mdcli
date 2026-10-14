// Credit Card Types
interface CardInvoiceEntry {
  id: number | string;
  descricao: string;
  valor: number;
  data: string;
  categoria?: number;
  parcela?: string;
  status?: string;
  tipo?: string;
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
