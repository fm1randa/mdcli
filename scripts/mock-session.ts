// GET /v1/frontend/sessao for scripts/mock-api.ts: the one session state every reader shares.
import type { SessionResponse } from '../test/fixtures.js';
import { SESSION_RESPONSE } from '../test/fixtures.js';

const { ngInit } = SESSION_RESPONSE.payload;
const mdweb = ngInit.usuario.config?.mdweb ?? {};

// The test fixture's preferences plus the overwrite preference import run reads
// (payload.ngInit.usuario.config.mdweb.conciliacao) and the accrual view entries summary --regime needs.
// The real state also carries credentials.
const SESSION_STATE: SessionResponse = {
  ...SESSION_RESPONSE,
  payload: {
    ngInit: {
      ...ngInit,
      usuario: {
        ...ngInit.usuario,
        conta: { config: { ...ngInit.usuario.conta?.config, visaoCompetencia: true } },
        config: { mdweb: { ...mdweb, conciliacao: { o: 'd', s: false, sd: true } } },
      },
    },
  },
};

/** The logged-in session state, or undefined when this request is not its GET. */
export function sessionRoute(method: string, pathname: string): Response | undefined {
  if (method !== 'GET' || pathname !== '/api/v1/frontend/sessao') return undefined;
  return Response.json(SESSION_STATE);
}
