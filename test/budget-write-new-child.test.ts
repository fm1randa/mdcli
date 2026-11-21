import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { BudgetGoalRow } from '../src/types/index.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE } from './fixtures.js';
import { BUDGET_EXTRA_CATEGORIES, INVEST_ROWS, SPEND_ROWS } from './budget-fixtures.js';
import { createHome, MANUAL_AUTH, runCli, startMockApi, type MockApi, type RecordedRequest, type TestHome } from './helpers.js';

// #317: a child with no goal in the month is absent from the budget report, so
// the parent guard has to find its parent through the category catalog.
// Alimentação (10) holds -800 over Mercado (11) -200 and Aves (14) -100.
// Feira (15) is its child with no row; Potro (16) is a child of Zebra (12), whose goal is 0.

let api: MockApi;
let home: TestHome;

const PARENT_SUM_900 = 'Category Alimentação in 2026-11 must be at least the sum of its children (minimum 900).';

function posts(): RecordedRequest[] {
  return api.requests.filter((request) => request.method === 'POST' && request.path === '/v1/metas/orcamento');
}

beforeEach(() => {
  const spend: BudgetGoalRow[] = SPEND_ROWS.map((row) => ({ ...row }));
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', { ...CATEGORIES_RESPONSE, items: [...CATEGORIES_RESPONSE.items, ...BUDGET_EXTRA_CATEGORIES] });
  api.on('GET /v2/lancamentos/metasorcamento', (request) => (request.query.get('investimentos') === 'true' ? INVEST_ROWS : spend));
  api.on('POST /v1/metas/orcamento', {});
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

describe('budget set on a child with no goal in the month', () => {
  test('refuses a new child that would pull the parent under the sum, before any post', async () => {
    const result = await runCli(
      ['budget', 'set', '--category', 'Feira', '--value', '-600', '--month', '2026-11', '--dangerously-skip-confirmation'],
      { home, api },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(PARENT_SUM_900);
    expect(posts()).toHaveLength(0);
  });

  test('dry-run refuses it too', async () => {
    const result = await runCli(
      ['budget', 'set', '--category', '15', '--value', '-600', '--month', '2026-11', '--dry-run', '--json'],
      { home, api },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(PARENT_SUM_900);
    expect(result.stdout).toBe('');
  });

  test('posts a new child that fits under the parent', async () => {
    const result = await runCli(
      ['budget', 'set', '--category', 'Feira', '--value', '-500', '--month', '2026-11', '--dangerously-skip-confirmation'],
      { home, api },
    );
    expect(result.exitCode).toBe(0);
    expect(posts()[0]?.body).toEqual({
      metas: [{ meta: -500, categoria: 15, tipo: 'd', datas: ['2026-11-01'], sobreescrever: false }],
    });
  });

  test('posts a new child whose parent goal is 0', async () => {
    const result = await runCli(
      ['budget', 'set', '--category', 'Potro', '--value', '-900', '--month', '2026-11', '--dangerously-skip-confirmation'],
      { home, api },
    );
    expect(result.exitCode).toBe(0);
    expect(posts()).toHaveLength(1);
  });
});
