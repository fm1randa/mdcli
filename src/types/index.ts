export interface AuthConfig {
  token: string;
  apiKey: string;
  policy: string;
  signature: string;
  uid: string;
}

export interface ApiHeaders {
  Authorization: string;
  Cookie: string;
  Mdapikey: string;
  Mdpolicy: string;
  Mdsignature: string;
  Mduid: string;
}

interface CategoryDfcDre {
  id: number;
  tipo: string[];
  label: string;
}

export interface CategoryMeta {
  dfc: CategoryDfcDre[];
  dre: CategoryDfcDre[];
}

interface CategoryPermissions {
  visivel: boolean;
  acoes: {
    editar: boolean;
    excluir: boolean;
  };
  lancamento?: {
    tipo?: {
      c: string;
      v: string[];
    };
    conta?: {
      tipoInvestimento?: {
        c: string;
        v: number[];
      };
    };
    contaDestino?: {
      tipo?: {
        c: string;
        v: string[];
      };
    };
    contaOrigem?: {
      tipo?: {
        c: string;
        v: string[];
      };
      tipoInvestimento?: {
        c: string;
        v: number[];
      };
    };
  };
}

export interface Category {
  id: number;
  nome: string;
  nomeRel: string;
  tipo: 'd' | 'r' | 't';
  status: boolean;
  permissoes: CategoryPermissions;
  _ordenacao: string;
  sistema: boolean;
  tipoL?: number;
}

export interface CategoriesResponse {
  meta: CategoryMeta;
  items: Category[];
}

export interface NormalizedCategory {
  id: number;
  name: string;
  type: 'expense' | 'income' | 'transfer';
  active: boolean;
  system: boolean;
}

interface AccountTypeMeta {
  id: number;
  nome: string;
  liquidez?: number;
  basico?: boolean;
  grupobp?: number;
  invest?: boolean;
  pj?: boolean;
  finalidades?: number[];
}

interface AccountGroupMeta {
  id: number;
  nome: string;
}

interface AccountFinalidadeMeta {
  id: number;
  nome: string;
}

export interface AccountMeta {
  tipos: AccountTypeMeta[];
  gruposbp: AccountGroupMeta[];
  finalidades: AccountFinalidadeMeta[];
}

interface AccountBank {
  id: string;
  nome: string;
  img: string;
  tipo: string[];
}

interface AccountPermissions {
  visivel: boolean;
  acoes: {
    editar: boolean;
    excluir: boolean;
  };
  lancamento?: Record<string, unknown>;
}

export interface Account {
  id: number;
  nome: string;
  tipo: string;
  tipoNovo: number;
  classificacaobp?: string;
  status: boolean;
  encerrada: boolean;
  banco?: AccountBank;
  limite?: number;
  exibirBP: boolean;
  apenasTransferencia: boolean;
  dataUltimoExtrato?: string;
  saldoUltimoExtrato?: number;
  liquidez?: number;
  saldoInicial: number;
  moeda: number;
  dataSaldoInicial?: string;
  considerarCarteiraInvestimentos: number;
  permissoes: AccountPermissions;
  criptoGcap?: number;
  connectionAccount?: number;
  connection?: number;
  tipoLimite?: number;
  fechamento?: number;
  contada?: number;
  proximoVencimento?: string;
  proximoFechamento?: string;
  finalidade?: number;
  metasEconomia?: number[];
}

export interface AccountsResponse {
  meta: AccountMeta;
  items: Account[];
}

export interface NormalizedAccount {
  id: number;
  name: string;
  type: string;
  bank: string | null;
  balance: number;
  active: boolean;
  closed: boolean;
}

interface Tag {
  id: number;
  nome: string;
  status: boolean;
  cor: string;
}

export type TagsResponse = Tag[];

export interface NormalizedTag {
  id: number;
  name: string;
  color: string;
  active: boolean;
}

export interface CreateTagPayload {
  nome: string;
  cor: string;
  status: boolean;
}

export interface CreateTagResponse {
  id: number;
  nome: string;
  status: boolean;
  cor: string;
}

export type AliasType = 'accounts' | 'categories' | 'tags';

export interface Alias {
  id: number;
  name: string;
}

export interface AliasMap {
  accounts: Alias[];
  categories: Alias[];
  tags: Alias[];
}

export type AuthMethod = 'browser-chrome' | 'browser-firefox' | '1password' | 'browser-manual' | 'manual';

export interface MdcliConfig {
  auth?: AuthConfig;
  authMethod?: AuthMethod;
  lastUpdated?: string;
  aliases?: AliasMap;
  opItem?: string;
  captchaApiKey?: string;
}

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
  status: 'conciliado' | 'pendente' | 'agendado';
  tipo?: 'd' | 'r' | 't';
  valor: number;
  valorPrevisto?: number;
  valorEfetivo?: number;
  data: string;
  dataPrevista: string;
  dataEfetiva?: string;
  dataCriacao?: string;
  exibirCp?: boolean;
  exibirCr?: boolean;
  permissoes?: EntryPermissions;
  estorno?: boolean;
  conta: number;
  categoria?: number;
  categoriaPai?: number;
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
}

// Credit Card Types
export interface CardInvoiceEntry {
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

export interface CardFutureInstallment {
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

export interface NormalizedEntry {
  id: number | string;
  description: string;
  date: string;
  value: number;
  type: 'expense' | 'income' | 'transfer';
  status: 'reconciled' | 'pending' | 'scheduled';
  accountId: number;
  categoryId: number | null;
  installment: string | null;
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

export interface CreateEntryStatus {
  confirmado: boolean;
  conciliado: boolean;
}

export interface CreateEntryAgenda {
  repeticao: 'f';
  intervalo: 'd' | 'w' | 'M' | 'y';
  quantidade: number;
  frequencia: number;
  inicial: number;
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
  '#': string | null;
  conta: string;
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
  dataEfetiva: string;
  dataPrevista: string;
  valorEfetivo: number;
  valorPrevisto: number;
}

export interface CreateEntryResponse {
  id: number;
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
