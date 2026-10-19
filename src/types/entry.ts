interface EntryPermissions {
  visivel: boolean;
  acoes: {
    conciliar: boolean;
    confirmar: boolean;
    editar: boolean;
    excluir: boolean;
    clonar: boolean;
  };
}

interface EntryDetail {
  id: string;
  descricao: string;
  valor: number;
  tipo: 'd' | 'r' | 't';
  estorno: boolean;
  categoria: number;
}

interface EntryAgenda {
  frequencia: number;
  intervalo: string;
  quantidade: number;
  primeiraData: string;
}

export interface Entry {
  id: number | string;
  descricao: string;
  conciliado?: boolean;
  dataCompetencia?: string;
  parcela?: string;
  /** pendente/agendado: not confirmed (planned date up to today / future). */
  status: 'conciliado' | 'confirmado' | 'nconciliado' | 'pendente' | 'agendado';
  /** d expense, r income, t transfer, p invoice payment (dogfood 2026-10-19). */
  tipo?: 'd' | 'r' | 't' | 'p';
  valor: number;
  valorPrevisto?: number;
  valorEfetivo?: number;
  data: string;
  dataPrevista: string;
  dataEfetiva?: string | null;
  dataCriacao?: string;
  exibirCp?: boolean;
  exibirCr?: boolean;
  permissoes?: EntryPermissions;
  estorno?: boolean;
  conta: number;
  categoria?: number;
  categoriaPai?: number;
  plastico?: number;
  observacoes?: string;
  ndocumento?: string;
  lembrete?: number;
  automatico?: boolean;
  regime?: string;
  dataReconhecimento?: string;
  detalhes?: EntryDetail[];
  tags?: number[];
  agendaId?: number;
  agenda?: EntryAgenda;
  valorT?: number;
  valorPrevistoT?: number;
  valorEfetivoT?: number;
  plasticoT?: number;
  contaT?: number;
  transferencia?: number;
  metaEconomiaDestino?: number;
  projecaoFatura?: number;
}

export interface EntriesResponse {
  list: Entry[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
  };
}

export interface EntriesParams {
  accountIds: number[];
  startDate: string;
  endDate: string;
  includeFaturas?: boolean;
  pageSize?: number;
  page?: number;
  categoryIds?: number[];
  tagIds?: number[];
  keywords?: string;
  value?: number;
  status?: number;
  entryType?: number;
  /** tipoRepeticao bitmask: 1 single, 2 installment, 4 fixed. */
  repetition?: number;
}

/** unknown: a label the CLI does not know (see entries show --raw). */
export type EntryStatus = 'reconciled' | 'confirmed' | 'pending' | 'scheduled' | 'unknown';
export type EntryRepetition = 'single' | 'installment' | 'fixed';

export interface NormalizedEntry {
  id: number | string;
  description: string;
  /** Planned date (dataPrevista), YYYY-MM-DD. */
  date: string;
  value: number;
  type: 'expense' | 'income' | 'transfer' | 'invoice' | 'payment';
  status: EntryStatus;
  accountId: number;
  categoryId: number | null;
  installment: string | null;
  repetition: EntryRepetition;
  /** agendaId: the series an occurrence belongs to. */
  seriesId: number | null;
  effectiveDate: string | null;
  competenceDate: string | null;
  /** The other account of a transfer (contaT). */
  transferAccountId: number | null;
  tagIds: number[];
  notes: string;
  documentNumber: string | null;
}

interface CreateEntryStatus {
  confirmado: boolean;
  conciliado: boolean;
}

export interface CreateEntryAgenda {
  /** f = fixed (repeats with the same value), p = installments (parcelada). */
  repeticao: 'f' | 'p';
  intervalo: 'd' | 'w' | 'M' | 'y';
  quantidade: number;
  frequencia: number;
  inicial: number;
}

/** One installment of a parcelada series, as the web app sends it. */
export interface CreateEntryInstallment {
  valor: number;
  data: string;
}

export interface CreateEntryPayload {
  descricao: string;
  tipo: 'd' | 'r' | 't';
  status: CreateEntryStatus;
  exibirCp: boolean;
  exibirCr: boolean;
  automatico: boolean;
  lembrete: number;
  anexos: unknown[];
  agenda?: CreateEntryAgenda;
  parcelas?: CreateEntryInstallment[];
  '#': string | null;
  /** Every entry but a transfer, which names contaOrigem/contaDestino instead. */
  conta?: string;
  contaOrigem?: number;
  contaDestino?: number;
  inicio: string;
  fim: string;
  i: string;
  valor: number;
  data: string;
  base: string | null;
  categoria: number | null;
  metaEconomia: number | null;
  observacoes: string;
  tags: number[];
  transferencia: boolean;
  conciliado: boolean;
  dataEfetiva: string | null;
  dataCompetencia?: string;
  dataPrevista: string;
  valorEfetivo: number | null;
  valorPrevisto: number;
  /** Transfers: the destination half's value (positive). */
  valorT?: number;
  valorPrevistoT?: number;
  valorEfetivoT?: number | null;
}

export interface CreateEntryResponse {
  /** Numeric, except for card purchases: see entries/entry-id.ts. */
  id: number | string;
  descricao: string;
  conciliado: boolean;
  dataCompetencia: string;
  status: string;
  tipo: 'd' | 'r' | 't';
  valor: number;
  valorPrevisto: number;
  valorEfetivo: number;
  data: string;
  dataPrevista: string;
  dataEfetiva: string;
  dataCriacao: string;
  exibirCp: boolean;
  exibirCr: boolean;
  permissoes: EntryPermissions;
  estorno: boolean;
  conta: number;
  categoria: number | null;
  tags: number[];
  observacoes: string;
  lembrete: string;
  automatico: boolean;
}

export interface UpdateEntryPayload {
  id: number;
  descricao?: string;
  valor?: number;
  valorPrevisto?: number;
  valorEfetivo?: number;
  data?: string;
  dataPrevista?: string;
  dataEfetiva?: string;
  conta?: number;
  categoria?: number | null;
  tags?: number[];
  observacoes?: string;
  status?: {
    confirmado: boolean;
    conciliado: boolean;
  };
  conciliado?: boolean;
  tipo?: 'd' | 'r' | 't';
}
