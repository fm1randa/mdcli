import type { BankStatementResponse, ConnectionsResponse, Entry } from '../src/types/index.js';
import { localDay, type MockApi } from './helpers.js';

/**
 * Statement row fields the CLI reads (candidates.ts `overwrittenFields`, list.ts `documentNumbers`,
 * commit.ts) that src/types does not declare. A candidate Entry carries contato, centro and projeto too.
 */
interface UndeclaredRowFields {
  contato?: number | null;
  centro?: number | null;
  projeto?: number | null;
  categoria?: number | null;
  tags?: number[];
  ndocumento?: string;
  nomePlastico?: string;
  dataCompetencia?: string;
}

/** One row of a bank statement, as GET /v1/integracao/account/:id/transactions answers it. */
export type BankTransaction = NonNullable<BankStatementResponse['lancamentos']>[number] & UndeclaredRowFields;

/** An Entry GET /v2/lancamentos lists as an import candidate. */
export type CandidateEntry = Entry & Pick<UndeclaredRowFields, 'contato' | 'centro' | 'projeto'>;

/** An unreconciled candidate of Account 201, dated by its dataPrevista unless `fields` says otherwise. */
export function candidate(fields: Pick<Entry, 'id' | 'descricao' | 'valor' | 'dataPrevista'> & Partial<CandidateEntry>): CandidateEntry {
  return { status: 'nconciliado', data: fields.dataPrevista, conta: 201, ...fields };
}

/** A --since inside the 90-day window the CLI accepts, whatever day the suite runs on. */
export const SINCE = localDay(-30);

// Fictional ids. Connection 501 links connection account 301 to Account 201 (Conta Teste in the account fixture).
// markImportedWindowDays is 0 here, as it is on every real Connection (import-64-facts.md, 2026-10-22):
// markImported marks the rows on the page's latest date only. A test that needs a wider window answers
// the GET with `connections(days)`.
export const CONNECTIONS: ConnectionsResponse = [
  { id: 501, status: 'UPDATED', markImportedWindowDays: 0, accounts: [{ id: 301, type: 'CONTA CORRENTE', conta: 201 }] },
];

/** The connections list with a Connection whose markImported window is `days` days. */
export function connections(days: number): ConnectionsResponse {
  return [
    { id: 501, status: 'UPDATED', markImportedWindowDays: days, accounts: [{ id: 301, type: 'CONTA CORRENTE', conta: 201 }] },
  ];
}

interface StatementOptions {
  inicio?: string;
  fim?: string;
  saldo?: number;
  connectionAccount?: number;
}

/** Answers the statement GET of a connection account (301 unless given) with `rows`. */
export function mockStatement(api: MockApi, rows: BankTransaction[], options: StatementOptions = {}): void {
  const { inicio = '2026-10-01', fim = '2026-10-10', saldo = 0, connectionAccount = 301 } = options;
  api.on(`GET /v1/integracao/account/${connectionAccount}/transactions`, {
    inicio,
    fim,
    saldo,
    lancamentos: rows,
  });
}
