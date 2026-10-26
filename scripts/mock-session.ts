// GET /v1/frontend/sessao for scripts/mock-api.ts: the one session state every reader shares.
import { SESSION_RESPONSE } from '../test/fixtures.js';

// The test fixture's preferences plus the overwrite preference import run reads
// (payload.ngInit.usuario.config.mdweb.conciliacao). The real state also carries credentials.
const SESSION_STATE = {
  ...SESSION_RESPONSE,
  payload: {
    ngInit: {
      ...SESSION_RESPONSE.payload.ngInit,
      usuario: {
        ...SESSION_RESPONSE.payload.ngInit.usuario,
        config: { mdweb: { ...SESSION_RESPONSE.payload.ngInit.usuario.config.mdweb, conciliacao: { o: 'd', s: false, sd: true } } },
      },
    },
  },
};

/** The logged-in session state, or undefined when this request is not its GET. */
export function sessionRoute(method: string, pathname: string): Response | undefined {
  if (method !== 'GET' || pathname !== '/api/v1/frontend/sessao') return undefined;
  return Response.json(SESSION_STATE);
}
