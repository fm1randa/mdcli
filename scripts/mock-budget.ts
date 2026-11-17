import { INVEST_ROWS, SPEND_ROWS } from '../test/budget-fixtures.js';
import { json } from './mock-http.js';

const PATH = '/api/v2/lancamentos/metasorcamento';

/** GET metasorcamento. Expense and income when investimentos=false, investment rows when true. */
export function budgetRoute(method: string, url: URL): Response | undefined {
  if (method !== 'GET' || url.pathname !== PATH) return undefined;
  const investments = url.searchParams.get('investimentos');
  if (investments === 'true') return json<'GET /v2/lancamentos/metasorcamento'>(INVEST_ROWS);
  if (investments === 'false') return json<'GET /v2/lancamentos/metasorcamento'>(SPEND_ROWS);
  return undefined;
}
