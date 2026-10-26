// GET /v1/integracao/account/:connectionAccount/transactions for scripts/verify.sh, and the AI
// category suggestion it triggers. Fictional ids only. 9001 is
// Nubank's connection account in mock-connections.ts; 10 is Alimentação (d).

const TRANSACTIONS = /^\/api\/v1\/integracao\/account\/(\d+)\/transactions$/;
const DUPLICATES = '/api/v1/lancamentos/duplicidade';
const AI = '/api/v1/smartmatch/ai';
const SESSION = '/api/v1/frontend/sessao';

// The logged-in session state, reduced to the overwrite preference import run reads
// (payload.ngInit.usuario.config.mdweb.conciliacao). The real one also carries credentials.
const SESSION_STATE = {
  branch: 'app',
  payload: { ngInit: { usuario: { config: { mdweb: { conciliacao: { o: 'd', s: false, sd: true } } } } } },
};

const PADARIA = {
  integrationId: 'aaaaaaaa-1111-4000-8000-000000000001',
  descricao: 'Padaria Ficticia',
  valor: -12.34,
  data: '2026-10-07',
  moeda: 1,
  // No rule category, so the CLI asks the AI with this token.
  _ca: { ait: { d: 'tok-padaria' } },
};

const STATEMENT = {
  inicio: '2026-10-01',
  fim: '2026-10-20',
  saldo: 10.5,
  lancamentos: [PADARIA],
};

/**
 * Nubank (1001) with a last statement (dataUltimoExtrato) 3 days ago, local time, with the time the API adds:
 * inside the 90-day window whatever day verify runs on, so import list without --since loads from it.
 */
export function withRecentStatement<T extends { id: number }>(account: T): T {
  if (account.id !== 1001) return account;
  const now = new Date();
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3).toLocaleDateString('sv-SE');
  return { ...account, dataUltimoExtrato: `${day}T00:00:00` };
}

/**
 * The fictional statement for connection account 9001, the AI answer, and the session state with the
 * overwrite preference, or null for any other request.
 * The Import commit has no route here: verify.sh never writes, and the test suite asserts the commit bodies.
 */
export function importRoute(method: string, url: URL): Response | null {
  if (method === 'GET' && url.pathname === DUPLICATES) return Response.json({});
  if (method === 'POST' && url.pathname === AI) return Response.json([10]);
  if (method === 'GET' && url.pathname === SESSION) return Response.json(SESSION_STATE);
  const match = TRANSACTIONS.exec(url.pathname);
  if (!match || method !== 'GET') return null;
  if (match[1] !== '9001') return Response.json({ message: 'not found' }, { status: 404 });
  return Response.json(STATEMENT);
}
