import { beforeEach, describe, expect, test } from 'bun:test';
import { budgetRoute, resetBudgetMock } from '../scripts/mock-budget.js';
import type { BudgetGoalRow } from '../src/types/index.js';

const WRITE = 'http://127.0.0.1/api/v1/metas/orcamento';

beforeEach(() => {
  resetBudgetMock();
});

async function post(metas: readonly unknown[]): Promise<Response> {
  const response = await budgetRoute('POST', new URL(WRITE), new Request(WRITE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metas }),
  }));
  if (!response) throw new Error('budget route missed the POST');
  return response;
}

async function read(month: string): Promise<Response> {
  const url = new URL('http://127.0.0.1/api/v2/lancamentos/metasorcamento');
  url.searchParams.set('investimentos', 'false');
  url.searchParams.set('inicio', `${month}-01`);
  url.searchParams.set('fim', `${month}-28`);
  const response = await budgetRoute('GET', url, new Request(url.toString()));
  if (!response) throw new Error('budget route missed the GET');
  return response;
}

function line(meta: number, categoria: number, datas: readonly string[]) {
  return { meta, categoria, tipo: 'd', datas, sobreescrever: false };
}

async function goal(month: string, categoria: number): Promise<number | null | undefined> {
  const rows = await (await read(month)).json() as BudgetGoalRow[];
  return rows.find((row) => row.categoria === categoria)?.meta;
}

describe('mock budget writes per month', () => {
  test('a later month can reject a span the first month would accept', async () => {
    const raised = await post([line(-350, 11, ['2026-12-01'])]);
    expect(raised.status).toBe(200);
    expect(await goal('2026-11', 11)).toBe(-200);
    expect(await goal('2026-12', 11)).toBe(-350);

    const span = await post([line(-400, 10, ['2026-11-01', '2026-12-01'])]);
    expect(span.status).toBe(422);
    expect(await goal('2026-11', 10)).toBe(-800);
    expect(await goal('2026-12', 10)).toBe(-800);
  });
});
