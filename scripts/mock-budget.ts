import type { BudgetGoalRow } from '../src/types/index.js';
import { roundToCents } from '../src/utils/currency.js';
import { INVEST_ROWS, SPEND_ROWS } from '../test/budget-fixtures.js';
import { badRequest, conflict, json, readJsonBody } from './mock-http.js';

const READ_PATH = '/api/v2/lancamentos/metasorcamento';
const WRITE_PATH = '/api/v1/metas/orcamento';
const PARENT_TOLERANCE = 0.001;

/** One snapshot. The read mock already ignores the month, so a write updates that same snapshot. */
let spendRows: BudgetGoalRow[] = SPEND_ROWS.map((row) => ({ ...row }));

/** GET metasorcamento, and POST /v1/metas/orcamento which updates the rows the next GET returns. */
export async function budgetRoute(method: string, url: URL, req: Request): Promise<Response | undefined> {
  if (url.pathname === READ_PATH && method === 'GET') return readGoals(url);
  if (url.pathname === WRITE_PATH && method === 'POST') return writeGoals(req);
  return undefined;
}

function readGoals(url: URL): Response | undefined {
  const investments = url.searchParams.get('investimentos');
  if (investments === 'true') return json<'GET /v2/lancamentos/metasorcamento'>(INVEST_ROWS);
  if (investments === 'false') return json<'GET /v2/lancamentos/metasorcamento'>(spendRows);
  return undefined;
}

async function writeGoals(req: Request): Promise<Response> {
  const body = await readJsonBody(req);
  if (body instanceof Response) return body;
  const metas = body.metas;
  if (!Array.isArray(metas)) return badRequest('metas must be an array');
  const next = spendRows.map((row) => ({ ...row }));
  for (const item of metas) {
    const line = postedLine(item);
    if (line instanceof Response) return line;
    const index = next.findIndex((row) => row.tipo === line.tipo && row.categoria === line.categoria);
    if (index >= 0) {
      const current = next[index];
      if (current) next[index] = { ...current, meta: line.meta };
    } else {
      next.push(blank(line.tipo, line.categoria, line.meta));
    }
  }
  const parent = parentBelowChildren(next);
  if (parent !== null) return conflict([parent]);
  spendRows = next;
  return json<'POST /v1/metas/orcamento'>({});
}

interface PostedLine {
  meta: number;
  categoria: number;
  tipo: 'd' | 'r';
}

function postedLine(item: unknown): PostedLine | Response {
  if (!item || typeof item !== 'object') return badRequest('each meta must be an object');
  const line = item as Record<string, unknown>;
  if (typeof line.meta !== 'number') return badRequest('meta must be a number');
  if (typeof line.categoria !== 'number') return badRequest('categoria must be a number');
  if (line.tipo !== 'd' && line.tipo !== 'r') return badRequest('tipo must be d or r');
  if (!Array.isArray(line.datas) || line.datas.some((date) => typeof date !== 'string' || !/^\d{4}-\d{2}-01$/.test(date))) {
    return badRequest('datas must be YYYY-MM-01 dates');
  }
  if (typeof line.sobreescrever !== 'boolean') return badRequest('sobreescrever must be a boolean');
  return { meta: line.meta, categoria: line.categoria, tipo: line.tipo };
}

function blank(tipo: string, categoria: number, meta: number): BudgetGoalRow {
  return {
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
