// GET /v1/integracao/account/:connectionAccount/transactions for scripts/verify.sh.
// Fictional ids only. 9001 is Nubank's connection account in mock-connections.ts.

const TRANSACTIONS = /^\/api\/v1\/integracao\/account\/(\d+)\/transactions$/;
const DUPLICATES = '/api/v1/lancamentos/duplicidade';
// The Import commit, in the web order. The bodies are asserted by the test suite, not here.
const COMMIT = new Set([
  '/api/v1/integracao/transactions/markImported',
  '/api/v1/lancamentos/conciliacao',
  '/api/v1/lancamentos/importar',
]);

const STATEMENT = {
  inicio: '2026-10-01',
  fim: '2026-10-20',
  saldo: 10.5,
  lancamentos: [
    {
      integrationId: 'aaaaaaaa-1111-4000-8000-000000000001',
      descricao: 'Padaria Ficticia',
      valor: -12.34,
      data: '2026-10-07',
      moeda: 1,
    },
  ],
};

/** The fictional statement for connection account 9001 and the commit POSTs, or null for any other request. */
export function importRoute(method: string, url: URL): Response | null {
  if (method === 'GET' && url.pathname === DUPLICATES) return Response.json({});
  if (method === 'POST' && COMMIT.has(url.pathname)) return Response.json({});
  const match = TRANSACTIONS.exec(url.pathname);
  if (!match || method !== 'GET') return null;
  if (match[1] !== '9001') return Response.json({ message: 'not found' }, { status: 404 });
  return Response.json(STATEMENT);
}
