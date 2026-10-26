import { localDay, type MockApi } from './helpers.js';

/** A --since inside the 90-day window the CLI accepts, whatever day the suite runs on. */
export const SINCE = localDay(-30);

// Fictional ids. Connection 501 links connection account 9001 to Account 1001 (Nubank in the account fixture).
export const CONNECTIONS = [
  { id: 501, status: 'UPDATED', accounts: [{ id: 9001, type: 'CONTA CORRENTE', conta: 1001 }] },
];

interface StatementOptions {
  inicio?: string;
  fim?: string;
  saldo?: number;
  connectionAccount?: number;
  /** More top-level fields of the statement payload. */
  extra?: Record<string, unknown>;
}

/** Answers the statement GET of a connection account (9001 unless given) with `rows`. */
export function mockStatement(api: MockApi, rows: unknown[], options: StatementOptions = {}): void {
  const { inicio = '2026-10-01', fim = '2026-10-10', saldo = 0, connectionAccount = 9001, extra = {} } = options;
  api.on(`GET /v1/integracao/account/${connectionAccount}/transactions`, {
    inicio,
    fim,
    saldo,
    lancamentos: rows,
    ...extra,
  });
}
