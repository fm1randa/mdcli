// GET /v1/integracao/connections and PUT /v1/integracao/connection/update/:id
// for scripts/verify.sh. Fictional ids only.
// 201 and 202 are Conta Teste and Cartão Teste in the shared account fixture.
// 303 has no Meu Dinheiro Account.
// No account carries a summary: like the real GET, which rarely has one (the web gets it from the sync PUT).
import { appendFileSync } from 'node:fs';
import type { ConnectionsResponse, SyncRequestResponse } from '../src/types/index.js';
import { parseInteger } from '../src/utils/parse.js';

const CONNECTIONS_PATH = '/api/v1/integracao/connections';
const UPDATE_PATH = /^\/api\/v1\/integracao\/connection\/update\/(\d+)$/;

// Fast enough for verify.sh, positive as the real statusCheckWindow.
const MOCK_STATUS_CHECK_WINDOW_SECONDS = 0.05;

const MOCK_CONNECTIONS: ConnectionsResponse = [
  {
    id: 501,
    status: 'UPDATED',
    accounts: [
      { id: 301, type: 'CONTA CORRENTE', conta: 201 },
      { id: 302, type: 'CARTAOCREDITO', conta: 202 },
      { id: 303, type: 'CARTAOCREDITO' },
      // Cartão Teste Fechado (mock-closed-invoice.ts).
      { id: 304, type: 'CARTAOCREDITO', conta: 206 },
    ],
  },
];

// The GETs after a Sync show UPDATING twice, so the CLI has a progress line,
// and the following one shows the final status.
let checksBeforeFinalStatus = 0;

/** One JSON line per request when MDCLI_MOCK_LOG is set, with the query string when there is one. Unset, the mock stays quiet. */
export function recordMockRequest(method: string, pathname: string, search: string): void {
  const file = process.env.MDCLI_MOCK_LOG;
  if (!file) return;
  const line = search === '' ? { method, path: pathname } : { method, path: pathname, query: search.slice(1) };
  appendFileSync(file, `${JSON.stringify(line)}\n`);
}

function syncResponse(id: number): Response {
  const connection = MOCK_CONNECTIONS.find((item) => item.id === id);
  if (!connection) return Response.json({ message: 'not found' }, { status: 404 });
  connection.status = 'UPDATING';
  checksBeforeFinalStatus = 2;
  const body: SyncRequestResponse = {
    id,
    status: connection.status,
    statusCheckWindow: MOCK_STATUS_CHECK_WINDOW_SECONDS,
  };
  return Response.json(body);
}

/** The connections list or the Sync PUT answer, or null when this request is neither. */
export function connectionsRoute(method: string, pathname: string): Response | null {
  const update = UPDATE_PATH.exec(pathname);
  if (update && method === 'PUT') {
    const id = parseInteger(update[1] ?? '', 1);
    return id === undefined ? Response.json({ message: 'invalid id' }, { status: 400 }) : syncResponse(id);
  }
  if (pathname !== CONNECTIONS_PATH || method !== 'GET') return null;

  if (checksBeforeFinalStatus > 0) {
    checksBeforeFinalStatus -= 1;
  } else {
    for (const connection of MOCK_CONNECTIONS) {
      if (connection.status === 'UPDATING') connection.status = 'UPDATED';
    }
  }
  return Response.json(MOCK_CONNECTIONS);
}
