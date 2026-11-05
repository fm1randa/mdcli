// GET /v1/integracao/connections for scripts/verify.sh. Fictional ids only.
// 201 and 202 are Conta Teste and Cartão Teste in the shared account fixture.
// 303 has no Meu Dinheiro Account.
// No account carries a summary: like the real GET, which rarely has one (the web gets it from the sync PUT).
import { appendFileSync } from 'node:fs';
import type { ConnectionsResponse } from '../src/types/index.js';

const CONNECTIONS_PATH = '/api/v1/integracao/connections';

export const MOCK_CONNECTIONS: ConnectionsResponse = [
  {
    id: 501,
    status: 'UPDATED',
    accounts: [
      { id: 301, type: 'CONTA CORRENTE', conta: 201 },
      { id: 302, type: 'CARTAOCREDITO', conta: 202 },
      { id: 303, type: 'CARTAOCREDITO' },
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
