/** One account row of a Connection (GET /v1/integracao/connections). */
interface ConnectionAccount {
  /** The bank side's account ID. */
  id: number;
  /** The Meu Dinheiro Account, when linked. */
  conta?: number;
  type?: string;
  /**
   * The new Bank Transactions the web's import badge shows. The real GET rarely
   * sends it (the web gets it from the sync PUT), so it stays optional.
   */
  summary?: unknown;
}

/** A bank connection and the accounts it carries. */
interface Connection {
  id: number;
  status?: string;
  accounts?: ConnectionAccount[];
  /** How far back from the latest date markImported still marks. */
  markImportedWindowDays?: number;
}

export type ConnectionsResponse = Connection[];

/** One row of GET /v1/integracao/account/:connectionAccount/transactions. */
interface BankTransaction {
  integrationId?: string;
  descricao?: string;
  valor?: number;
  data?: string;
  moeda?: number;
  /** The AI category token for the row. */
  _ca?: { ait?: Record<string, string> };
}

/** A bank statement: one connection account's transactions for a period. */
export interface BankStatementResponse {
  inicio?: string;
  fim?: string;
  saldo?: number;
  lancamentos?: BankTransaction[];
}
