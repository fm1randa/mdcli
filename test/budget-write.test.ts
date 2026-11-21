import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { BudgetGoalRow } from '../src/types/index.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, category } from './fixtures.js';
import { BUDGET_EXTRA_CATEGORIES, INVEST_ROWS, SPEND_ROWS } from './budget-fixtures.js';
import { createHome, MANUAL_AUTH, runCli, startMockApi, type MockApi, type RecordedRequest, type TestHome } from './helpers.js';

let api: MockApi;
let home: TestHome;
let spend: BudgetGoalRow[];

const plain = (value: string): string => value.replace(/\u00a0/g, ' ');

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

function goal(stdout: string, id: number): number | null | undefined {
  const report = JSON.parse(stdout) as {
    budgets: Record<string, { categories: Array<{ category: { id: number }; figures: { goal: number } | null; subcategories: Array<{ category: { id: number }; figures: { goal: number } }> }> }>;
  };
  for (const section of Object.values(report.budgets)) {
    for (const line of section.categories) {
      if (line.category.id === id) return line.figures?.goal ?? null;
      for (const child of line.subcategories) {
        if (child.category.id === id) return child.figures.goal;
      }
    }
  }
  return undefined;
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

describe('budget set and remove', () => {
  test('dry-run prints the web save and does not post', async () => {
    const result = await runCli(
      ['budget', 'set', '--category', 'Outros', '--value', '-50', '--month', '2026-11', '--dry-run', '--json'],
      { home, api },
    );
    expect(result.exitCode).toBe(0);
    expect(posts()).toHaveLength(0);
    expect(JSON.parse(result.stdout)).toEqual({
      metas: [{ meta: -50, categoria: 40, tipo: 'd', datas: ['2026-11-01'], sobreescrever: false }],
    });
  });

  test('sends the typed sign, then the next budget read shows it', async () => {
    const write = await runCli(
      ['budget', 'set', '--category', '40', '--value', '-50', '--month', '2026-12', '--dangerously-skip-confirmation'],
      { home, api },
    );
    expect(write.exitCode).toBe(0);
    expect(posts().map((request) => request.body)).toEqual([
      { metas: [{ meta: -50, categoria: 40, tipo: 'd', datas: ['2026-12-01'], sobreescrever: false }] },
    ]);
    const read = await runCli(['budget', '--month', '2026-12', '--json'], { home, api });
    expect(read.exitCode).toBe(0);
    expect(goal(read.stdout, 40)).toBe(-50);
  });

  test('a second set of the same value posts the same body', async () => {
    const args = ['budget', 'set', '--category', '40', '--value', '-50', '--month', '2026-11', '--dangerously-skip-confirmation'];
    expect((await runCli(args, { home, api })).exitCode).toBe(0);
    expect((await runCli(args, { home, api })).exitCode).toBe(0);
    expect(posts()).toHaveLength(2);
    expect(posts()[0]?.body).toEqual(posts()[1]?.body);
    const read = await runCli(['budget', '--month', '2026-11', '--json'], { home, api });
    expect(goal(read.stdout, 40)).toBe(-50);
  });

  test('keeps a positive expense the user typed', async () => {
    const result = await runCli(
      ['budget', 'set', '--category', '40', '--value', '800', '--month', '2026-11', '--dangerously-skip-confirmation', '--json'],
      { home, api },
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).meta).toBe(800);
    expect(posts()[0]?.body).toEqual({
      metas: [{ meta: 800, categoria: 40, tipo: 'd', datas: ['2026-11-01'], sobreescrever: false }],
    });
  });

  test('repeats month starts through --until', async () => {
    const result = await runCli(
      ['budget', 'set', '--category', '20', '--value', '4500', '--month', '2026-11', '--until', '2027-01', '--dangerously-skip-confirmation', '--json'],
      { home, api },
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).months).toEqual(['2026-11', '2026-12', '2027-01']);
    const body = posts()[0]?.body as { metas: Array<{ tipo: string; meta: number; datas: string[] }> };
    expect(body.metas[0]).toMatchObject({ tipo: 'r', meta: 4500, datas: ['2026-11-01', '2026-12-01', '2027-01-01'] });
    const read = await runCli(['budget', '--month', '2026-11', '--json'], { home, api });
    expect(goal(read.stdout, 20)).toBe(4500);
  });

  test('a span reads the category catalog once and both goal reads of every month', async () => {
    const result = await runCli(
      ['budget', 'set', '--category', '40', '--value', '-50', '--month', '2026-11', '--until', '2027-02', '--dry-run'],
      { home, api },
    );
    expect(result.exitCode).toBe(0);
    expect(api.requests.filter((request) => request.path === '/v1/cadastros/categorias')).toHaveLength(1);
    const goalReads = api.requests
      .filter((request) => request.path === '/v2/lancamentos/metasorcamento')
      .map((request) => `${request.query.get('inicio')} ${request.query.get('investimentos')}`)
      .sort();
    expect(goalReads).toEqual([
      '2026-11-01 false', '2026-11-01 true', '2026-12-01 false', '2026-12-01 true',
      '2027-01-01 false', '2027-01-01 true', '2027-02-01 false', '2027-02-01 true',
    ]);
  });

  test('refuses a parent below its children before any post', async () => {
    const result = await runCli(
      ['budget', 'set', '--category', '10', '--value', '-10', '--month', '2026-11', '--dangerously-skip-confirmation'],
      { home, api },
    );
    expect(result.exitCode).toBe(1);
    expect(posts()).toHaveLength(0);
    expect(result.stderr).toContain('Alimentação');
    expect(result.stderr).toContain('2026-11');
    expect(result.stderr).toContain('300');
  });

  test('refuses a child that would pull the parent under the sum', async () => {
    const result = await runCli(
      ['budget', 'set', '--category', '11', '--value', '-900', '--month', '2026-11', '--dry-run'],
      { home, api },
    );
    expect(result.exitCode).toBe(1);
    expect(posts()).toHaveLength(0);
    expect(result.stderr).toContain('Alimentação');
  });

  test('prints a 422 conflitos entry even when the local check allows the write', async () => {
    api.fail('POST /v1/metas/orcamento', 422, {
      conflitos: ['A soma da categoria Outros deve ser maior ou igual a soma das filhas'],
    });
    const result = await runCli(
      ['budget', 'set', '--category', '40', '--value', '-50', '--month', '2026-11', '--dangerously-skip-confirmation'],
      { home, api },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('A soma da categoria Outros deve ser maior ou igual a soma das filhas');
    expect(result.stderr).not.toContain('POST /v1/metas/orcamento');
  });

  test('prints an object conflito as JSON and keeps a 422 without conflitos raw', async () => {
    api.fail('POST /v1/metas/orcamento', 422, { conflitos: [{ mensagem: 'parent too low', categoria: 40 }] });
    const objectBody = await runCli(
      ['budget', 'set', '--category', '40', '--value', '-50', '--month', '2026-11', '--dangerously-skip-confirmation'],
      { home, api },
    );
    expect(objectBody.stderr).toContain('parent too low');

    api.fail('POST /v1/metas/orcamento', 422, { message: 'nope' });
    const raw = await runCli(
      ['budget', 'set', '--category', '40', '--value', '-50', '--month', '2026-11', '--dangerously-skip-confirmation'],
      { home, api },
    );
    expect(raw.exitCode).toBe(1);
    expect(raw.stderr).toContain('422');
    expect(raw.stderr).toContain('nope');
  });

  test('remove posts meta 0 and the next read drops the row', async () => {
    const write = await runCli(
      ['budget', 'remove', '--category', 'Outros', '--month', '2026-11', '--dangerously-skip-confirmation', '--json'],
      { home, api },
    );
    expect(write.exitCode).toBe(0);
    expect(JSON.parse(write.stdout).meta).toBe(0);
    expect(posts()[0]?.body).toEqual({
      metas: [{ meta: 0, categoria: 40, tipo: 'd', datas: ['2026-11-01'], sobreescrever: false }],
    });
    const read = await runCli(['budget', '--month', '2026-11', '--json'], { home, api });
    expect(goal(read.stdout, 40)).toBeUndefined();
  });

  test('removing a parent is allowed while its children remain', async () => {
    const write = await runCli(
      ['budget', 'remove', '--category', 'Alimentação', '--month', '2026-11', '--dangerously-skip-confirmation'],
      { home, api },
    );
    expect(write.exitCode).toBe(0);
    expect(posts()).toHaveLength(1);
    const read = await runCli(['budget', '--month', '2026-11', '--json'], { home, api });
    expect(goal(read.stdout, 10)).toBeNull();
    expect(goal(read.stdout, 11)).toBe(-200);
  });

  test('removing a goal that is already absent posts 0', async () => {
    const result = await runCli(
      ['budget', 'remove', '--category', 'Zebra', '--month', '2026-11', '--dangerously-skip-confirmation'],
      { home, api },
    );
    expect(result.exitCode).toBe(0);
    expect(posts()[0]?.body).toEqual({
      metas: [{ meta: 0, categoria: 12, tipo: 'd', datas: ['2026-11-01'], sobreescrever: false }],
    });
  });

  test('n cancels and y confirms', async () => {
    const cancelled = await runCli(
      ['budget', 'set', '--category', '40', '--value', '-50', '--month', '2026-11'],
      { home, api, stdin: 'n\n' },
    );
    expect(cancelled.exitCode).toBe(0);
    expect(plain(cancelled.stdout)).toContain('cancelled');
    expect(posts()).toHaveLength(0);

    const confirmed = await runCli(
      ['budget', 'set', '--category', '40', '--value', '-50', '--month', '2026-11'],
      { home, api, stdin: 'y\n' },
    );
    expect(confirmed.exitCode).toBe(0);
    expect(posts()).toHaveLength(1);
  });

  test('refuses --json when it would have to prompt', async () => {
    const result = await runCli(
      ['budget', 'set', '--category', '40', '--value', '-50', '--month', '2026-11', '--json'],
      { home, api },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('--json');
    expect(posts()).toHaveLength(0);
  });
});
