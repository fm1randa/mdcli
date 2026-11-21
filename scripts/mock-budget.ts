import type { BudgetGoalRow } from '../src/types/index.js';
import { roundToCents } from '../src/utils/currency.js';
import { BUDGET_EXTRA_CATEGORIES, INVEST_ROWS, SPEND_ROWS } from '../test/budget-fixtures.js';
import { CATEGORIES_RESPONSE } from '../test/fixtures.js';
import { badRequest, conflict, json, readJsonBody } from './mock-http.js';

const READ_PATH = '/api/v2/lancamentos/metasorcamento';
const WRITE_PATH = '/api/v1/metas/orcamento';
const PARENT_TOLERANCE = 0.001;

/** `Category.pai` of the mock catalog, so a new goal row carries `categoriaPai` as the API's does. */
const PARENT_OF = new Map(
  [...CATEGORIES_RESPONSE.items, ...BUDGET_EXTRA_CATEGORIES].flatMap((item) => (item.pai === undefined ? [] : [[item.id, item.pai] as const])),
);

/** One snapshot per `YYYY-MM`. A write touches only the months in `datas`. */
const spendByMonth = new Map<string, BudgetGoalRow[]>();

/** GET metasorcamento, and POST /v1/metas/orcamento which updates the rows the next GET returns. */
export async function budgetRoute(method: string, url: URL, req: Request): Promise<Response | undefined> {
  if (url.pathname === READ_PATH && method === 'GET') return readGoals(url);
  if (url.pathname === WRITE_PATH && method === 'POST') return writeGoals(req);
  return undefined;
}

function readGoals(url: URL): Response | undefined {
  const investments = url.searchParams.get('investimentos');
  if (investments === 'true') return json<'GET /v2/lancamentos/metasorcamento'>(INVEST_ROWS);
  if (investments === 'false') {
    const month = url.searchParams.get('inicio')?.slice(0, 7) ?? 'default';
    return json<'GET /v2/lancamentos/metasorcamento'>(snapshot(month));
  }
  return undefined;
}

function snapshot(month: string): BudgetGoalRow[] {
  const existing = spendByMonth.get(month);
  if (existing) return existing;
  const fresh = SPEND_ROWS.map((row) => ({ ...row }));
  spendByMonth.set(month, fresh);
  return fresh;
}

async function writeGoals(req: Request): Promise<Response> {
  const body = await readJsonBody(req);
  if (body instanceof Response) return body;
  const metas = body.metas;
  if (!Array.isArray(metas)) return badRequest('metas must be an array');
  const lines: PostedLine[] = [];
  for (const item of metas) {
    const line = postedLine(item);
    if (line instanceof Response) return line;
    lines.push(line);
  }
  const pending = new Map<string, BudgetGoalRow[]>();
  for (const month of monthsOf(lines)) {
    let next = snapshot(month).map((row) => ({ ...row }));
    for (const line of lines) {
      if (!line.datas.some((date) => date.startsWith(month))) continue;
      next = applyLine(next, line);
    }
    const parent = parentBelowChildren(next);
    if (parent !== null) return conflict([parent]);
    pending.set(month, next);
  }
  for (const [month, rows] of pending) spendByMonth.set(month, rows);
  return json<'POST /v1/metas/orcamento'>({});
}

function monthsOf(lines: readonly PostedLine[]): string[] {
  const months: string[] = [];
  for (const line of lines) {
    for (const date of line.datas) {
      const month = date.slice(0, 7);
      if (!months.includes(month)) months.push(month);
    }
  }
  return months;
}

interface PostedLine {
  meta: number;
  categoria: number;
  tipo: 'd' | 'r';
  datas: readonly string[];
}

function postedLine(item: unknown): PostedLine | Response {
  if (!item || typeof item !== 'object') return badRequest('each meta must be an object');
  const line = item as Record<string, unknown>;
  if (typeof line.meta !== 'number') return badRequest('meta must be a number');
  if (typeof line.categoria !== 'number') return badRequest('categoria must be a number');
  if (line.tipo !== 'd' && line.tipo !== 'r') return badRequest('tipo must be d or r');
  if (!isMonthStarts(line.datas)) return badRequest('datas must be YYYY-MM-01 dates');
  if (typeof line.sobreescrever !== 'boolean') return badRequest('sobreescrever must be a boolean');
  return { meta: line.meta, categoria: line.categoria, tipo: line.tipo, datas: line.datas };
}

function isMonthStarts(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((date) => typeof date === 'string' && /^\d{4}-\d{2}-01$/.test(date));
}

function applyLine(rows: readonly BudgetGoalRow[], line: PostedLine): BudgetGoalRow[] {
  const next = rows.map((row) => ({ ...row }));
  const index = next.findIndex((row) => row.tipo === line.tipo && row.categoria === line.categoria);
  if (index >= 0) {
    const current = next[index];
    if (current) next[index] = { ...current, meta: line.meta };
  } else {
    next.push(blank(line.tipo, line.categoria, line.meta));
  }
  return next;
}

function blank(tipo: string, categoria: number, meta: number): BudgetGoalRow {
  const parent = PARENT_OF.get(categoria);
  return {
    ...(parent === undefined ? {} : { categoriaPai: parent }),
    meta,
    residuo: 0,
    confirmado: 0,
    projetado: 0,
    realizarc: 0,
    realizarp: 0,
    excedentec: 0,
    excedentep: 0,
    categoria,
    tipo,
  };
}

/**
 * The web's parent rule on the stored rows: a parent goal of 0 is allowed
 * (removing it), and any other parent must cover the absolute sum of its children.
 */
function parentBelowChildren(rows: readonly BudgetGoalRow[]): string | null {
  const childrenOf = new Map<number, { tipo: string; sum: number }>();
  for (const row of rows) {
    if (row.categoria == null || row.categoriaPai == null || !row.meta) continue;
    const current = childrenOf.get(row.categoriaPai) ?? { tipo: row.tipo, sum: 0 };
    current.sum = roundToCents(current.sum + Math.abs(row.meta));
    childrenOf.set(row.categoriaPai, current);
  }
  for (const [parentId, children] of childrenOf) {
    const parent = rows.find((row) => row.tipo === children.tipo && row.categoria === parentId);
    const goal = parent?.meta ?? 0;
    if (!goal) continue;
    if (Math.abs(goal) + PARENT_TOLERANCE < children.sum) {
      return `A soma da categoria ${parentId} deve ser maior ou igual a soma das filhas`;
    }
  }
  return null;
}
