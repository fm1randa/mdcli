// GET /v1/integracao/connections for scripts/verify.sh. Fictional ids only.
// 1001 and 1002 are Nubank and Cartão Azul in the shared account fixture.
// 9003 has no Meu Dinheiro Account.
// No account carries a summary: like the real GET, which rarely has one (the web gets it from the sync PUT).
import { appendFileSync } from 'node:fs';

const CONNECTIONS_PATH = '/api/v1/integracao/connections';

export const MOCK_CONNECTIONS = [
  {
    id: 501,
    status: 'UPDATED',
    accounts: [
      { id: 9001, type: 'CONTA CORRENTE', conta: 1001 },
      { id: 9002, type: 'CARTAOCREDITO', conta: 1002 },
      { id: 9003, type: 'CARTAOCREDITO' },
    ],
  },
];

/** One JSON line per request when MDCLI_MOCK_LOG is set, with the query string when there is one. Unset, the mock stays quiet. */
export function recordMockRequest(method: string, pathname: string, search: string): void {
  const file = process.env.MDCLI_MOCK_LOG;
  if (!file) return;
  const line = search === '' ? { method, path: pathname } : { method, path: pathname, query: search.slice(1) };
  appendFileSync(file, `${JSON.stringify(line)}\n`);
}

/** The connections list, or null when this request is not that GET. */
export function connectionsRoute(method: string, pathname: string): Response | null {
  if (pathname !== CONNECTIONS_PATH || method !== 'GET') return null;
  return Response.json(MOCK_CONNECTIONS);
}
