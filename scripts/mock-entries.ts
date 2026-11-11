// POST /v1/lancamentos, GET/PUT/DELETE /v1/lancamentos/:id and GET
// /v2/lancamentos (the statement list) for scripts/mock-api.ts.
import type { CreateEntryResponse, EntriesResponse, Entry } from '../src/types/index.js';
import { parseId, parseInteger } from '../src/utils/parse.js';
import { badRequest, notFound, numberOrNull, readJsonBody, requiredId, requiredNumber } from './mock-http.js';
import { checkCreatePayload, checkUpdateAccounts, createdEntry, entryType, mockEntryId, statusLabel } from './mock-entry-payload.js';
import { createCardPurchase } from './mock-card-purchases.js';
import { IMPORT_CANDIDATES } from './mock-import.js';
import { SEEDED_ENTRIES } from './mock-entry-seed.js';

export const ENTRIES_PATH = '/api/v1/lancamentos';
const NEW_ENTRY_ID = 401;

/** The tipo of an account ID (CARTAOCREDITO for a card), undefined when there is none. */
type AccountTipo = (conta: unknown) => string | undefined;

const isCard = (accountTipo: AccountTipo, conta: unknown): boolean => accountTipo(conta) === 'CARTAOCREDITO';

// tipoRepeticao bits, as the web app's Repetição filter sends them.
function repetitionBit(entry: { parcela?: string | null }): number {
  if (!entry.parcela) return 1;
  return entry.parcela === 'fixa' ? 4 : 2;
}

/** GET /v2/lancamentos: the seeded entries of the requested accounts, dates and repetition. */
export function entriesListRoute(url: URL, accountTipo: AccountTipo): Response {
  const ids = (JSON.parse(url.searchParams.get('contas') ?? '{}') as { ids?: number[] }).ids ?? [];
  const from = url.searchParams.get('inicio') ?? '';
  const to = url.searchParams.get('fim') ?? '';
  const repetition = parseInteger(url.searchParams.get('tipoRepeticao') ?? '7');
  if (repetition === undefined) return badRequest('tipoRepeticao must be a whole number');
  const candidates = url.searchParams.get('finalidade') === '3' ? IMPORT_CANDIDATES : [];
  // Under regime co (the web reports' accrual view) an entry falls in the range by its competence date.
  const accrual = url.searchParams.get('regime') === 'co';
  const list = [...Object.values(SEEDED_ENTRIES), ...candidates].filter((e) => {
    const date = String(accrual ? (e.dataCompetencia ?? e.dataPrevista) : e.dataPrevista);
    // Like the real statement list (finalidade 1), card purchases are left out:
    // they only show up in the card's invoices.
    return ids.includes(e.conta) && !isCard(accountTipo, e.conta) && date >= from && date <= to && (repetitionBit(e) & repetition) !== 0;
  });
  const response: EntriesResponse = { list, meta: { total: list.length, page: 1, pageSize: 200 } };
  return Response.json(response);
}

export async function entriesRoute(req: Request, path: string, accountTipo: AccountTipo): Promise<Response> {
  if (path === ENTRIES_PATH) {
    if (req.method !== 'POST') return notFound();
    const body = await readJsonBody(req);
    if (body instanceof Response) return body;
    if (typeof body.descricao !== 'string' || !body.descricao) return badRequest('descricao is required');
    if (typeof body.valor !== 'number') return badRequest('valor is required');

    // Card purchases (#12/#17): must carry dataCompetencia, invoice due as
    // dataPrevista, and stay unreconciled. Reject otherwise so verify catches
    // regressions through the real CLI path.
    if (isCard(accountTipo, body.conta)) {
      if (typeof body.dataCompetencia !== 'string' || !body.dataCompetencia) {
        return badRequest('dataCompetencia is required for credit card entries');
      }
      if (typeof body.dataPrevista !== 'string' || !body.dataPrevista) {
        return badRequest('dataPrevista is required for credit card entries');
      }
      if (body.conciliado === true || (body.status as { conciliado?: boolean } | undefined)?.conciliado === true) {
        return badRequest('credit card entries must not be reconciled');
      }
    }

    const invalid = checkCreatePayload(body);
    if (invalid) return badRequest(invalid);
    const created: CreateEntryResponse = isCard(accountTipo, body.conta)
      ? createCardPurchase(body)
      : createdEntry(body, mockEntryId(NEW_ENTRY_ID));
    return Response.json(created, { status: 201 });
  }

  const match = path.match(/^\/api\/v1\/lancamentos\/(\d+)$/);
  if (!match) return notFound();
  const id = parseId(match[1]);
  if (id === undefined) return notFound();
  const existing = SEEDED_ENTRIES[id];
  if (!existing) return notFound();

  if (req.method === 'GET') return Response.json(existing);

  if (req.method === 'PUT') {
    const body = await readJsonBody(req);
    if (body instanceof Response) return body;
    const inSeries = Boolean(existing.agendaId) && Boolean(existing.parcela);
    if (body.todos !== undefined && (typeof body.todos !== 'boolean' || !inSeries)) {
      return badRequest('todos only applies to an occurrence of a series, as a boolean');
    }
    // The GET's transferencia is a number; the web app's save always sends a boolean.
    if (typeof body.transferencia !== 'boolean') return badRequest('transferencia must be a boolean');
    const invalidAccounts = checkUpdateAccounts(body, accountTipo);
    if (invalidAccounts) return badRequest(invalidAccounts);
    const transfer = body.transferencia === true;
    const merged: Record<string, unknown> = { ...existing, ...body, id };
    // Like the real API: without todos: true the occurrence leaves its series.
    const keepsSeries = inSeries && body.todos === true;
    const updated: Omit<Entry, 'plastico'> & { plastico: number | null } = {
      ...existing,
      id,
      descricao: String(merged.descricao ?? existing.descricao),
      conciliado: merged.conciliado === true,
      dataCompetencia: typeof merged.dataCompetencia === 'string' ? merged.dataCompetencia : null,
      status: statusLabel(body, merged) ?? existing.status,
      agendaId: keepsSeries ? existing.agendaId : null,
      parcela: keepsSeries ? existing.parcela : null,
      tipo: entryType(merged.tipo),
      valor: requiredNumber(merged.valor, 'valor'),
      valorPrevisto: requiredNumber(merged.valor, 'valor'),
      valorEfetivo: numberOrNull(merged.valorEfetivo),
      estorno: merged.estorno === true,
      data: String(merged.data ?? existing.data),
      dataPrevista: String(merged.dataPrevista ?? existing.dataPrevista),
      dataEfetiva: typeof merged.dataEfetiva === 'string' ? merged.dataEfetiva : null,
      dataCriacao: new Date().toISOString(),
      exibirCp: true,
      exibirCr: true,
      conta: transfer ? requiredId(body.contaOrigem, 'contaOrigem') : requiredId(merged.conta ?? existing.conta, 'conta'),
      plastico: numberOrNull(merged.plastico),
      ...(transfer && { contaT: requiredId(body.contaDestino, 'contaDestino') }),
    };
    return Response.json(updated);
  }

  if (req.method === 'DELETE') {
    // The web app sends the scope as ?todos=true|false; it only means
    // something for an occurrence of a series.
    const todos = new URL(req.url).searchParams.get('todos');
    const inSeries = Boolean(existing.agendaId) && Boolean(existing.parcela);
    if (todos !== null && (!['true', 'false'].includes(todos) || !inSeries)) {
      return badRequest('todos only applies to an occurrence of a series, as true or false');
    }
    return new Response(null, { status: 204 });
  }

  return notFound();
}
