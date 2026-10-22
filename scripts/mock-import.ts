// GET /v1/integracao/account/:connectionAccount/transactions for scripts/verify.sh,
// and the AI category suggestion it triggers. Fictional ids only. 9001 is
// Nubank's connection account in mock-connections.ts; 10 is Alimentação (d).

const TRANSACTIONS = /^\/api\/v1\/integracao\/account\/(\d+)\/transactions$/;
const DUPLICATES = '/api/v1/lancamentos/duplicidade';
const AI = '/api/v1/smartmatch/ai';

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
      // No rule category, so the CLI asks the AI with this token.
      _ca: { ait: { d: 'tok-padaria' } },
    },
  ],
};

/**
 * The fictional statement for connection account 9001 and the AI answer, or null for any other request.
 * The Import commit has no route here: verify.sh never writes, and the test suite asserts the commit bodies.
 */
export function importRoute(method: string, url: URL): Response | null {
  if (method === 'GET' && url.pathname === DUPLICATES) return Response.json({});
  if (method === 'POST' && url.pathname === AI) return Response.json([10]);
  const match = TRANSACTIONS.exec(url.pathname);
  if (!match || method !== 'GET') return null;
  if (match[1] !== '9001') return Response.json({ message: 'not found' }, { status: 404 });
  return Response.json(STATEMENT);
}
