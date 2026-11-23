import { SAVINGS_GOALS } from '../test/fixtures.js';
import { goalBalanceAt, goalMovements } from '../test/goals-fixtures.js';
import { badRequest, json } from './mock-http.js';

export const GOALS_PATH = '/api/v1/metas/economia';

/** GET /v1/metas/economia, and each goal's /lancamentos and /saldo. Read only, as the CLI is. */
export function goalsRoute(method: string, url: URL): Response | undefined {
  if (method !== 'GET') return undefined;
  if (url.pathname === GOALS_PATH) return json<'GET /v1/metas/economia'>(SAVINGS_GOALS);
  const match = url.pathname.match(/^\/api\/v1\/metas\/economia\/(\d+)\/(lancamentos|saldo)$/);
  const id = SAVINGS_GOALS.find((candidate) => String(candidate.id) === match?.[1])?.id;
  if (!match || id === undefined) return undefined;
  if (match[2] === 'saldo') {
    const date = url.searchParams.get('data');
    if (!date) return badRequest('data is required');
    return json<`GET /v1/metas/economia/${number}/saldo`>(goalBalanceAt(id, date));
  }
  const start = url.searchParams.get('inicio');
  const end = url.searchParams.get('fim');
  if (!start || !end) return badRequest('inicio and fim are required');
  return json<`GET /v1/metas/economia/${number}/lancamentos`>(goalMovements(id, start, end));
}
