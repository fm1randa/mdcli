import { describe, expect, test } from 'bun:test';
import { budgetRoute } from '../scripts/mock-budget.js';
import type { BudgetGoalRow } from '../src/types/index.js';

// Imports only `budgetRoute`, which already exists on main. A new export would
// fail to load there, and fails-on-main counts that as infrastructure, not a
// failed assertion. On main the function ignores POST, so the status check fails.

const WRITE = 'http://127.0.0.1/api/v1/metas/orcamento';

function posted(metas: readonly unknown[]): Request {
  return new Request(WRITE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metas }),
  });
}

async function goal(month: string, categoria: number): Promise<number | null | undefined> {
  const url = new URL('http://127.0.0.1/api/v2/lancamentos/metasorcamento');
  url.searchParams.set('investimentos', 'false');
  url.searchParams.set('inicio', `${month}-01`);
  url.searchParams.set('fim', `${month}-28`);
  const response = await budgetRoute('GET', url, new Request(url.toString()));
  const rows = await response?.json() as BudgetGoalRow[] | undefined;
  return rows?.find((row) => row.categoria === categoria)?.meta;
}

function line(meta: number, categoria: number, datas: readonly string[]) {
  return { meta, categoria, tipo: 'd', datas, sobreescrever: false };
}

describe('mock budget writes per month', () => {
  test('a later month can reject a span the first month would accept', async () => {
    const raised = await budgetRoute('POST', new URL(WRITE), posted([line(-350, 11, ['2026-12-01'])]));
    expect(raised?.status).toBe(200);
    expect(await goal('2026-11', 11)).toBe(-200);
    expect(await goal('2026-12', 11)).toBe(-350);

    const span = await budgetRoute('POST', new URL(WRITE), posted([line(-400, 10, ['2026-11-01', '2026-12-01'])]));
    expect(span?.status).toBe(422);
    expect(await goal('2026-11', 10)).toBe(-800);
    expect(await goal('2026-12', 10)).toBe(-800);
  });
});

describe('mock budget parent rule on a new child', () => {
  test('a new child row carries its parent, so the parent rule refuses it', async () => {
    const over = await budgetRoute('POST', new URL(WRITE), posted([line(-600, 15, ['2027-01-01'])]));
    expect(over?.status).toBe(422);
    expect(await goal('2027-01', 15)).toBeUndefined();

    const fits = await budgetRoute('POST', new URL(WRITE), posted([line(-500, 15, ['2027-01-01'])]));
    expect(fits?.status).toBe(200);
    expect(await goal('2027-01', 15)).toBe(-500);

    const raised = await budgetRoute('POST', new URL(WRITE), posted([line(-1000, 11, ['2027-01-01'])]));
    expect(raised?.status).toBe(422);
  });
});
