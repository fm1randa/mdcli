/** One bank-side account on a Connection, as GET /v1/integracao/connections returns it. */
interface ConnectionAccountPayload {
  id?: number;
  type?: string;
  /** Meu Dinheiro Account id. Absent when the bank account is not linked. */
  conta?: number;
}

/** One Connection from GET /v1/integracao/connections. Fields the API omits stay absent. */
export interface ConnectionPayload {
  id?: number;
  status?: string;
  accounts?: ConnectionAccountPayload[];
}
