// Local HTTP server that mimics the Meu Dinheiro API for scripts/verify.sh.
// Uses the same fixtures as the unit tests; never touches the real API.
import type { Account, AccountsResponse, CategoriesResponse, CreateEntryResponse, EntriesResponse, Entry } from '../src/types/index.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, CREDIT_CARD_ACCOUNT, SAVINGS_ACCOUNT, TAGS_RESPONSE } from '../test/fixtures.js';
import { plasticsRoute } from './mock-plastics.js';
import { SEEDED_ENTRIES, checkCreatePayload, checkUpdateAccounts, createCardPurchase, createdEntry, entryType, mockEntryId, numberOrNull, statusLabel } from './mock-entries.js';
import { connectionsRoute, recordMockRequest } from './mock-connections.js';
import { IMPORT_CANDIDATES, importRoute, withRecentStatement } from './mock-import.js';
import { balancesRoute } from './mock-balances.js';
import { cardsRoute } from './mock-cards.js';
import { sessionRoute } from './mock-session.js';

// GitHub "latest release" endpoint used by the self-updater (no auth).
const MOCK_LATEST_TAG = 'v2099.1.1';
const LATEST_RELEASE_PATH = '/github/repos/fm1randa/mdcli/releases/latest';

const ACCOUNTS_PATH = '/api/v1/cadastros/contas';
const CATEGORIES_PATH = '/api/v1/cadastros/categorias';
const TAGS_PATH = '/api/v1/cadastros/tags';
const ENTRIES_PATH = '/api/v1/lancamentos';
const NEW_ACCOUNT_ID = 2001;
const NEW_ENTRY_ID = 401;

// Extra card without proximoVencimento so cards invoice (no --month) hits
// GET .../primeiraFatura (CREDIT_CARD_ACCOUNT alone always has a due date).
const CARD_NO_DUE: Account = {
  ...CREDIT_CARD_ACCOUNT,
  id: 203,
  nome: 'Cartão Teste Sem Vencimento',
  proximoVencimento: undefined,
  proximoFechamento: undefined,
};

// Card with a date-only due date (real use 2026-10-19): date-only
// proximoVencimento, which new Date() reads as UTC midnight (the 15th in
// Brazil), plus the card settings cards list --json reports.
const CARD_DATE_ONLY: Account = {
  ...CREDIT_CARD_ACCOUNT,
  id: 205,
  nome: 'Cartão Teste Dois',
  limite: 5000,
  fechamento: 11,
  contada: 201,
  proximoVencimento: '2026-11-16',
  proximoFechamento: '2026-11-05',
};

// Real use (2026-10-16): an inactive category (hidden in the web app)
// listed after an active one with the same name. The two active "Casa" below
// reproduce #170: a name that matches several active categories is ambiguous.
const MOCK_CATEGORIES: CategoriesResponse = {
  ...CATEGORIES_RESPONSE,
  items: [
    ...CATEGORIES_RESPONSE.items,
    { ...CATEGORIES_RESPONSE.items[4], id: 42, nome: 'Moradia', nomeRel: 'Moradia', _ordenacao: 'MORADIA' },
    { ...CATEGORIES_RESPONSE.items[4], id: 41, nome: 'Moradia', nomeRel: 'Moradia', _ordenacao: 'MORADIA', status: false },
    { ...CATEGORIES_RESPONSE.items[4], id: 43, nome: 'Casa', nomeRel: 'Casa', _ordenacao: 'CASA' },
    { ...CATEGORIES_RESPONSE.items[4], id: 44, nome: 'Casa', nomeRel: 'Casa', _ordenacao: 'CASA' },
  ],
};

const MOCK_ACCOUNTS: AccountsResponse = {
  ...ACCOUNTS_RESPONSE,
  items: [...ACCOUNTS_RESPONSE.items.map(withRecentStatement), CARD_NO_DUE, SAVINGS_ACCOUNT, CARD_DATE_ONLY],
};

function notFound(): Response {
  return Response.json({ message: 'not found' }, { status: 404 });
}

function badRequest(message: string): Response {
  return Response.json({ message }, { status: 400 });
}

async function readJsonBody(req: Request): Promise<Record<string, unknown> | Response> {
  if (!req.headers.get('Content-Type')?.startsWith('application/json')) {
    return Response.json({ message: 'expected a JSON body' }, { status: 415 });
  }
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return badRequest('invalid JSON body');
  }
}

function typeName(tipoNovo: unknown): string | undefined {
  return MOCK_ACCOUNTS.meta.tipos.find((t) => t.id === tipoNovo)?.nome;
}

function isCreditCardId(conta: unknown): boolean {
  const id = Number(conta);
  const account = MOCK_ACCOUNTS.items.find((a) => a.id === id);
  return account?.tipo === 'CARTAOCREDITO';
}

async function accountsRoute(req: Request, path: string): Promise<Response> {
  if (path === ACCOUNTS_PATH) {
    if (req.method === 'GET') return Response.json(MOCK_ACCOUNTS);
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      if (body instanceof Response) return body;
      const nome = body.nome;
      const tipo = typeName(body.tipoNovo);
      if (typeof nome !== 'string' || !nome) return badRequest('nome is required');
      if (!tipo) return badRequest(`unknown tipoNovo ${String(body.tipoNovo)}`);
      const created: Account = {
        id: NEW_ACCOUNT_ID,
        nome,
        tipo,
        tipoNovo: Number(body.tipoNovo),
        status: true,
        encerrada: false,
        exibirBP: body.exibirBP !== false,
        apenasTransferencia: false,
        saldoInicial: Number(body.saldoInicial ?? 0),
        moeda: Number(body.moeda ?? 1),
        dataSaldoInicial: typeof body.dataSaldoInicial === 'string' ? body.dataSaldoInicial : undefined,
        considerarCarteiraInvestimentos: 1,
        liquidez: Number(body.liquidez ?? 1),
        permissoes: { visivel: true, acoes: { editar: true, excluir: true } },
        ...(typeof body.banco === 'string' && { banco: { id: body.banco, nome: body.banco, img: '', tipo: [tipo] } }),
      };
      return Response.json(created, { status: 201 });
    }
    return notFound();
  }

  const match = path.match(/^\/api\/v1\/cadastros\/contas\/(\d+)$/);
  const existing = match && MOCK_ACCOUNTS.items.find((a) => a.id === Number(match[1]));
  if (!existing) return notFound();

  if (req.method === 'PUT') {
    const body = await readJsonBody(req);
    if (body instanceof Response) return body;
    const { banco: _banco, ...changes } = body;
    const updated: Account = { ...existing, ...changes, id: existing.id, tipo: typeName(changes.tipoNovo) ?? existing.tipo };
    return Response.json(updated);
  }
  if (req.method === 'DELETE') {
    return new Response(null, { status: 204 });
  }
  return notFound();
}

// tipoRepeticao bits, as the web app's Repetição filter sends them.
function repetitionBit(entry: { parcela?: string | null }): number {
  if (!entry.parcela) return 1;
  return entry.parcela === 'fixa' ? 4 : 2;
}

/** GET /v2/lancamentos: the seeded entries of the requested accounts, dates and repetition. */
function entriesListRoute(url: URL): Response {
  const ids = (JSON.parse(url.searchParams.get('contas') ?? '{}') as { ids?: number[] }).ids ?? [];
  const from = url.searchParams.get('inicio') ?? '';
  const to = url.searchParams.get('fim') ?? '';
  const repetition = Number(url.searchParams.get('tipoRepeticao') ?? 7);
  const candidates = url.searchParams.get('finalidade') === '3' ? IMPORT_CANDIDATES : [];
  const list = [...Object.values(SEEDED_ENTRIES), ...candidates].filter((e) => {
    const date = String(e.dataPrevista);
    // Like the real statement list (finalidade 1), card purchases are left out:
    // they only show up in the card's invoices.
    return ids.includes(Number(e.conta)) && !isCreditCardId(e.conta) && date >= from && date <= to && (repetitionBit(e) & repetition) !== 0;
  });
  const response: EntriesResponse = { list, meta: { total: list.length, page: 1, pageSize: 200 } };
  return Response.json(response);
}

async function entriesRoute(req: Request, path: string): Promise<Response> {
  if (path === ENTRIES_PATH) {
    if (req.method !== 'POST') return notFound();
    const body = await readJsonBody(req);
    if (body instanceof Response) return body;
    if (typeof body.descricao !== 'string' || !body.descricao) return badRequest('descricao is required');
    if (typeof body.valor !== 'number') return badRequest('valor is required');

    // Card purchases (#12/#17): must carry dataCompetencia, invoice due as
    // dataPrevista, and stay unreconciled. Reject otherwise so verify catches
    // regressions through the real CLI path.
    if (isCreditCardId(body.conta)) {
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
    const created: CreateEntryResponse = isCreditCardId(body.conta)
      ? createCardPurchase(body)
      : createdEntry(body, mockEntryId(NEW_ENTRY_ID));
    return Response.json(created, { status: 201 });
  }

  const match = path.match(/^\/api\/v1\/lancamentos\/(\d+)$/);
  if (!match) return notFound();
  const id = Number(match[1]);
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
    const invalidAccounts = checkUpdateAccounts(body, (conta) => MOCK_ACCOUNTS.items.find((a) => a.id === Number(conta))?.tipo);
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
      valor: Number(merged.valor),
      valorPrevisto: Number(merged.valor),
      valorEfetivo: numberOrNull(merged.valorEfetivo),
      estorno: merged.estorno === true,
      data: String(merged.data ?? existing.data),
      dataPrevista: String(merged.dataPrevista ?? existing.dataPrevista),
      dataEfetiva: typeof merged.dataEfetiva === 'string' ? merged.dataEfetiva : null,
      dataCriacao: new Date().toISOString(),
      exibirCp: true,
      exibirCr: true,
      conta: transfer ? Number(body.contaOrigem) : Number(merged.conta ?? existing.conta),
      plastico: numberOrNull(merged.plastico),
      ...(transfer && { contaT: Number(body.contaDestino) }),
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

const server = Bun.serve({
  port: 0,
  fetch(req) {
    const url = new URL(req.url);
    recordMockRequest(req.method, url.pathname, url.search);
    if (url.pathname === LATEST_RELEASE_PATH) return Response.json({ tag_name: MOCK_LATEST_TAG });
    if (req.headers.get('Mdapikey') !== 'verify-key') {
      return Response.json({ message: 'unauthorized' }, { status: 401 });
    }
    if (url.pathname === ACCOUNTS_PATH || url.pathname.startsWith(`${ACCOUNTS_PATH}/`)) {
      return accountsRoute(req, url.pathname);
    }
    if (url.pathname === CATEGORIES_PATH && req.method === 'GET') {
      return Response.json(MOCK_CATEGORIES);
    }
    if (url.pathname === TAGS_PATH && req.method === 'GET') {
      return Response.json(TAGS_RESPONSE);
    }
    if (url.pathname.startsWith('/api/v1/cartoes/')) {
      const card = cardsRoute(req, url.pathname, isCreditCardId, (id) => MOCK_ACCOUNTS.items.find((a) => a.id === id)?.limite);
      if (card) return card;
    }
    if (url.pathname === '/api/v2/lancamentos' && req.method === 'GET') {
      return url.searchParams.get('type') === 'sum' ? balancesRoute(url, isCreditCardId) : entriesListRoute(url);
    }
    // duplicidade lives under /lancamentos, so it has to be claimed before that prefix.
    const imported = importRoute(req.method, url);
    if (imported) return imported;
    if (url.pathname === ENTRIES_PATH || url.pathname.startsWith(`${ENTRIES_PATH}/`)) {
      return entriesRoute(req, url.pathname);
    }
    return connectionsRoute(req.method, url.pathname) ?? plasticsRoute(req.method, url.pathname) ?? sessionRoute(req.method, url.pathname) ?? notFound();
  },
});

// Line 1: port. Line 2: our own pid, so verify.sh can stop exactly this process
// even when `bun` is a wrapper script that does not exec.
console.log(`${server.port}\n${process.pid}`);
