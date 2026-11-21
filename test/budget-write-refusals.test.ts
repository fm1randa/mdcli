import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { BudgetGoalRow } from '../src/types/index.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, category } from './fixtures.js';
import { BUDGET_EXTRA_CATEGORIES, INVEST_ROWS, SPEND_ROWS } from './budget-fixtures.js';
import { createHome, MANUAL_AUTH, runCli, startMockApi, type MockApi, type RecordedRequest, type TestHome } from './helpers.js';

let api: MockApi;
let home: TestHome;
let spend: BudgetGoalRow[];

function posts(): RecordedRequest[] {
  return api.requests.filter((request) => request.method === 'POST' && request.path === '/v1/metas/orcamento');
}

function applyWrite(body: unknown): Record<string, never> {
  const metas = (body as { metas: Array<{ meta: number; categoria: number; tipo: string }> }).metas;
  for (const meta of metas) {
    const index = spend.findIndex((row) => row.tipo === meta.tipo && row.categoria === meta.categoria);
    const current = spend[index];
    if (current) spend[index] = { ...current, meta: meta.meta };
  }
  return {};
}

beforeEach(() => {
  spend = SPEND_ROWS.map((row) => ({ ...row }));
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', {
    ...CATEGORIES_RESPONSE,
    items: [
      ...CATEGORIES_RESPONSE.items,
      ...BUDGET_EXTRA_CATEGORIES,
      category(41, 'Arquivada', 'd', { status: false }),
      category(43, 'Casa', 'd'),
      category(44, 'Casa', 'd'),
    ],
  });
  api.on('GET /v2/lancamentos/metasorcamento', (request) => (request.query.get('investimentos') === 'true' ? INVEST_ROWS : spend));
  api.on('POST /v1/metas/orcamento', (request) => applyWrite(request.body));
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

describe('budget set and remove: refusals and limits', () => {
  test('refuses a transfer, an ambiguous name, an inactive category, zero and a reversed range', async () => {
    const transfer = await runCli(
      ['budget', 'set', '--category', '30', '--value', '-10', '--month', '2026-11', '--dry-run'],
      { home, api },
    );
    expect(transfer.exitCode).toBe(1);
    expect(transfer.stderr).toContain('transfer');

    const ambiguous = await runCli(
      ['budget', 'set', '--category', 'Casa', '--value', '-10', '--month', '2026-11', '--dry-run'],
      { home, api },
    );
    expect(ambiguous.exitCode).toBe(1);
    expect(ambiguous.stderr).toContain('43');

    const inactive = await runCli(
      ['budget', 'set', '--category', '41', '--value', '-10', '--month', '2026-11', '--dry-run'],
      { home, api },
    );
    expect(inactive.exitCode).toBe(1);
    expect(inactive.stderr).toContain('inactive');

    const zero = await runCli(
      ['budget', 'set', '--category', '40', '--value', '0', '--month', '2026-11', '--dry-run'],
      { home, api },
    );
    expect(zero.exitCode).toBe(1);
    expect(zero.stderr).toContain('budget remove');

    const range = await runCli(
      ['budget', 'set', '--category', '40', '--value', '-10', '--month', '2026-11', '--until', '2026-10', '--dry-run'],
      { home, api },
    );
    expect(range.exitCode).toBe(1);
    expect(range.stderr).toContain('--until');
    expect(posts()).toHaveLength(0);
  });

  test('refuses a later month that would put the parent under its children', async () => {
    api.on('GET /v2/lancamentos/metasorcamento', (request) => {
      if (request.query.get('investimentos') === 'true') return INVEST_ROWS;
      if (request.query.get('inicio')?.startsWith('2026-12')) {
        return SPEND_ROWS.map((row) => (row.categoria === 11 ? { ...row, meta: -350 } : { ...row }));
      }
      return spend;
    });
    const december = await runCli(
      ['budget', 'set', '--category', '10', '--value', '-400', '--month', '2026-12', '--dangerously-skip-confirmation'],
      { home, api },
    );
    expect(december.exitCode).toBe(1);
    expect(december.stderr).toContain('Alimentação');
    expect(december.stderr).toContain('2026-12');
    expect(posts()).toHaveLength(0);

    const span = await runCli(
      ['budget', 'set', '--category', '10', '--value', '-400', '--month', '2026-11', '--until', '2026-12', '--dangerously-skip-confirmation'],
      { home, api },
    );
    expect(span.exitCode).toBe(1);
    expect(span.stderr).toContain('Alimentação');
    expect(span.stderr).toContain('2026-12');
    expect(span.stderr).not.toContain('2026-11');
    expect(posts()).toHaveLength(0);
  });

  test('dry-run help says it reads and does not save', async () => {
    const result = await runCli(['budget', 'set', '--help'], { home, api });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('without saving');
    expect(result.stdout).toContain('Only reads');
    expect(result.stdout).not.toContain('do not call the API');
  });

  test('refuses a span longer than 600 months instead of truncating it', async () => {
    const result = await runCli(
      ['budget', 'set', '--category', '40', '--value', '-50', '--month', '2000-01', '--until', '2100-01', '--dry-run'],
      { home, api },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('600');
    expect(result.stdout).not.toContain('2000-01');
    expect(posts()).toHaveLength(0);
  });
});
