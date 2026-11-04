import type { BankStatementResponse, Entry } from '../src/types/index.js';
import { localDay } from '../test/helpers.js';

// GET /v1/integracao/account/:connectionAccount/transactions for scripts/verify.sh, and the AI
// category suggestion it triggers. Fictional ids only. 301 is
// Conta Teste's connection account in mock-connections.ts; 10 is Alimentação (d).

const TRANSACTIONS = /^\/api\/v1\/integracao\/account\/(\d+)\/transactions$/;
const DUPLICATES = '/api/v1/lancamentos/duplicidade';
const AI = '/api/v1/smartmatch/ai';

const PADARIA = {
  integrationId: 'aaaaaaaa-1111-4000-8000-000000000001',
  descricao: 'Padaria Ficticia',
  valor: -12.34,
  data: '2026-10-07',
  moeda: 1,
  // No rule category, so the CLI asks the AI with this token.
  _ca: { ait: { d: 'tok-padaria' } },
};

// A rule category keeps the AI to the single Padaria token. The value pairs with IMPORT_CANDIDATES,
// so the list links it and the round-trip plans a conciliation.
const MERCADO = {
  integrationId: 'bbbbbbbb-2222-4000-8000-000000000002',
  descricao: 'Mercado Ficticio',
  valor: -20,
  data: '2026-10-08',
  moeda: 1,
  _ca: { c: { d: { categoria: { v: 11 } } } },
};

// The import duplicate lookup below pairs this row with Entry 77, so the list skips it.
const DUPLICADO = {
  integrationId: 'cccccccc-3333-4000-8000-000000000003',
  descricao: 'Cafe Duplicado',
  valor: -5,
  data: '2026-10-09',
  moeda: 1,
  _ca: { c: { d: { categoria: { v: 10 } } } },
};

const STATEMENT: BankStatementResponse = {
  inicio: '2026-10-01',
  fim: '2026-10-20',
  saldo: 10.5,
  lancamentos: [PADARIA, MERCADO, DUPLICADO],
};

/**
 * Entries only the import candidate search (finalidade 3) returns, so the list can link MERCADO
 * without moving the seeded balances other verify steps assert.
 */
export const IMPORT_CANDIDATES: Entry[] = [
  {
    id: 4321,
    descricao: 'Mercado Existente',
    tipo: 'd',
    valor: -20,
    data: '2026-10-08',
    dataPrevista: '2026-10-08',
    dataEfetiva: '2026-10-08',
    status: 'nconciliado',
    conciliado: false,
    conta: 201,
    categoria: 11,
    tags: [],
  },
];

const DUPLICATE_ENTRIES = { '2026-10-09': [{ id: 77, valor: -5 }] };

/**
 * Conta Teste (201) with a last statement (dataUltimoExtrato) 3 days ago, local time, with the time the API adds:
 * inside the 90-day window whatever day verify runs on, so import list without --since loads from it.
 */
export function withRecentStatement<T extends { id: number }>(account: T): T {
  if (account.id !== 201) return account;
  return { ...account, dataUltimoExtrato: `${localDay(-3)}T00:00:00` };
}

/**
 * The fictional statement for connection account 301 and the AI answer, or null for any other request.
 * The Import commit has no route here: verify.sh never writes, and the test suite asserts the commit bodies.
 */
export function importRoute(method: string, url: URL): Response | null {
  if (method === 'GET' && url.pathname === DUPLICATES) return Response.json(DUPLICATE_ENTRIES);
  if (method === 'POST' && url.pathname === AI) return Response.json([10]);
  const match = TRANSACTIONS.exec(url.pathname);
  if (!match || method !== 'GET') return null;
  if (match[1] !== '301') return Response.json({ message: 'not found' }, { status: 404 });
  return Response.json(STATEMENT);
}
