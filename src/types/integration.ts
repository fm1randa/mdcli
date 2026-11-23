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

/** The answer to PUT /v1/integracao/connection/update/:id. */
export interface SyncRequestResponse {
  id?: number;
  status?: string;
  /** Seconds the web waits before checking the connection again (5 when absent). */
  statusCheckWindow?: number;
}

/** d expense, r income, t transfer. */
type SuggestionKind = 'd' | 'r' | 't';

interface SuggestedField {
  v?: unknown;
}

interface SuggestionBucket {
  categoria?: { v: string };
  [field: string]: SuggestedField | undefined;
}

interface CategoryAnnotation {
  /** The AI token for one kind. The row sends a string array. */
  ait?: Partial<Record<SuggestionKind, readonly string[]>>;
  /** True when the suggestion is a transfer. */
  st?: boolean;
  /** The suggested description the web writes as the row's default. */
  d?: string;
  t?: readonly unknown[];
  /** Suggested fields by kind. */
  c?: Partial<Record<SuggestionKind, SuggestionBucket>>;
}

/** One row of GET /v1/integracao/account/:connectionAccount/transactions. */
interface BankTransaction {
  integrationId?: string;
  descricao?: string;
  valor?: number;
  data?: string;
  moeda?: number;
  /** Keyword list the real row carries. The CLI does not read it. */
  k?: readonly unknown[];
  _ca?: CategoryAnnotation;
}

/** A bank statement: one connection account's transactions for a period. */
export interface BankStatementResponse {
  inicio?: string;
  fim?: string;
  saldo?: number;
  lancamentos?: BankTransaction[];
}
