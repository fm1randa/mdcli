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

/** No balance: saldoUltimoExtrato is an Open Finance statement figure that
 * means nothing as a card balance (Filipe, dogfood 2026-10-19). */
export interface NormalizedCard extends Omit<NormalizedAccount, 'balance'> {
  limit: number | null;
  /** Day of the month the invoice is due. */
  dueDay: number | null;
  nextDueDate: string | null;
  nextClosingDate: string | null;
  /** Closing happens this many days before the due date. */
  closingDaysBeforeDue: number | null;
  /** Account that pays the invoice. */
  paymentAccountId: number | null;
}

export interface CreateAccountPayload {
  nome: string;
  tipoNovo: number;
  saldoInicial: number;
  dataSaldoInicial: string;
  exibirBP: boolean;
  moeda: number;
  liquidez?: number;
  banco?: string;
}

export type UpdateAccountPayload = Omit<Account, 'banco'> & { banco?: string };
