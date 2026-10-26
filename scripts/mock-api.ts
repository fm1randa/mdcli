// Local HTTP server that mimics the Meu Dinheiro API for scripts/verify.sh.
// Uses the same fixtures as the unit tests; never touches the real API.
import {
  ACCOUNTS_RESPONSE,
  CATEGORIES_RESPONSE,
  CREDIT_CARD_ACCOUNT,
  SAVINGS_ACCOUNT,
  TAGS_RESPONSE,
  cardInvoice,
} from '../test/fixtures.js';
import { plasticsRoute } from './mock-plastics.js';
import { SEEDED_ENTRIES, checkCreatePayload, checkUpdateAccounts, createCardPurchase, createdEntry, invoiceItems, statusLabel } from './mock-entries.js';
import { connectionsRoute, recordMockRequest } from './mock-connections.js';
import { importRoute, withRecentStatement } from './mock-import.js';

// GitHub "latest release" endpoint used by the self-updater (no auth).
const MOCK_LATEST_TAG = 'v2099.1.1';
const LATEST_RELEASE_PATH = '/github/repos/fm1randa/mdcli/releases/latest';

const ACCOUNTS_PATH = '/api/v1/cadastros/contas';
const CATEGORIES_PATH = '/api/v1/cadastros/categorias';
const TAGS_PATH = '/api/v1/cadastros/tags';
const ENTRIES_PATH = '/api/v1/lancamentos';
const NEW_ACCOUNT_ID = 2001;
const NEW_ENTRY_ID = 9001;

// Extra card without proximoVencimento so cards invoice (no --month) hits
// GET .../primeiraFatura (CREDIT_CARD_ACCOUNT alone always has a due date).
const CARD_NO_DUE = {
  ...CREDIT_CARD_ACCOUNT,
  id: 1003,
  nome: 'Cartão Sem Vencimento',
  proximoVencimento: undefined,
  proximoFechamento: undefined,
};

// Card shaped like the real Ourocard (dogfood 2026-10-19): date-only
// proximoVencimento, which new Date() reads as UTC midnight (the 15th in
// Brazil), plus the card settings cards list --json reports.
const CARD_DATE_ONLY = {
  ...CREDIT_CARD_ACCOUNT,
  id: 1005,
  nome: 'Cartão Ouro',
  limite: 21804,
  fechamento: 11,
  contada: 1001,
  proximoVencimento: '2026-11-16',
  proximoFechamento: '2026-11-05',
};

// Finanças report (2026-10-16): an inactive category (hidden in the web app)
// listed after an active one with the same name.
const MOCK_CATEGORIES = {
  ...CATEGORIES_RESPONSE,
  items: [
    ...CATEGORIES_RESPONSE.items,
    { ...CATEGORIES_RESPONSE.items[4], id: 42, nome: 'Moradia', nomeRel: 'Moradia', _ordenacao: 'MORADIA' },
    { ...CATEGORIES_RESPONSE.items[4], id: 41, nome: 'Moradia', nomeRel: 'Moradia', _ordenacao: 'MORADIA', status: false },
  ],
};

const MOCK_ACCOUNTS = {
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

/** Closing date ~8 days before due, matching the unit-test fixtures. */
function closingFor(dueDate: string): string {
  const [y, m, d] = dueDate.split('-').map(Number);
  const closing = new Date(y, m - 1, d - 8);
  const yy = closing.getFullYear();
  const mm = String(closing.getMonth() + 1).padStart(2, '0');
  const dd = String(closing.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

const sum = (items: Array<Record<string, unknown>>): number =>
  Math.round(items.reduce((total, e) => total + Number(e.valor), 0) * 100) / 100;

/**
 * valor and resumo of a mock invoice, with the resumo field names the web app
 * reads (md.js, resumo.setParams). Bill total excludes payments (tipo p),
 * matching resumo.totalFatura on the real API (dogfood 2026-10-19); the
 * payments listed in an invoice paid the previous one.
 */
function invoiceTotals(
  lancamentos: Array<Record<string, unknown>>,
  vencimento: string,
  fechamento: string,
  limite: number | undefined
) {
  const purchases = lancamentos.filter((e) => e.tipo !== 'p');
  const payments = lancamentos.filter((e) => e.tipo === 'p');
  const totalFatura = sum(purchases);
  return {
    valor: totalFatura,
    resumo: {
      vencimento,
      fechamento,
      valorFaturaAnterior: -sum(payments),
      pagamentosConf: sum(payments.filter((e) => e.status === 'conciliado')),
      pagamentosAgen: sum(payments.filter((e) => e.status !== 'conciliado')),
      totalFatura,
      totalPagar: totalFatura,
      conciliado: sum(purchases.filter((e) => e.status === 'conciliado')),
      nconciliado: sum(purchases.filter((e) => e.status !== 'conciliado')),
      receitas: sum(purchases.filter((e) => Number(e.valor) > 0)),
      despesas: sum(purchases.filter((e) => Number(e.valor) < 0)),
      ...(limite === undefined ? {} : { disponivel: Math.round((limite + totalFatura) * 100) / 100 }),
    },
  };
}

async function accountsRoute(req: Request, path: string): Promise<Response> {
  if (path === ACCOUNTS_PATH) {
    if (req.method === 'GET') return Response.json(MOCK_ACCOUNTS);
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      if (body instanceof Response) return body;
      const tipo = typeName(body.tipoNovo);
      if (typeof body.nome !== 'string' || !body.nome) return badRequest('nome is required');
      if (!tipo) return badRequest(`unknown tipoNovo ${String(body.tipoNovo)}`);
      return Response.json({ ...body, id: NEW_ACCOUNT_ID, tipo, status: true, encerrada: false }, { status: 201 });
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
    return Response.json({ ...existing, ...changes, id: existing.id, tipo: typeName(changes.tipoNovo) ?? existing.tipo });
  }
  if (req.method === 'DELETE') {
    return new Response(null, { status: 204 });
  }
  return notFound();
}

function cardsRoute(req: Request, path: string): Response {
  if (req.method !== 'GET') return notFound();

  const first = path.match(/^\/api\/v1\/cartoes\/(\d+)\/primeiraFatura$/);
  if (first) {
    const id = Number(first[1]);
    if (!MOCK_ACCOUNTS.items.some((a) => a.id === id && a.tipo === 'CARTAOCREDITO')) return notFound();
    // ISO date string (what fetchFirstInvoiceDate expects).
    return Response.json('2026-01-16');
  }

  const invoice = path.match(/^\/api\/v1\/cartoes\/(\d+)\/fatura\/(\d{4}-\d{2}-\d{2})$/);
  if (invoice) {
    const id = Number(invoice[1]);
    const due = invoice[2];
    if (!MOCK_ACCOUNTS.items.some((a) => a.id === id && a.tipo === 'CARTAOCREDITO')) return notFound();
    const lancamentos = invoiceItems(id, due);
    const card = MOCK_ACCOUNTS.items.find((a) => a.id === id) as { limite?: number } | undefined;
    return Response.json({
      ...cardInvoice(due, closingFor(due)),
      ...invoiceTotals(lancamentos, due, closingFor(due), card?.limite),
      lancamentos,
    });
  }

  const future = path.match(/^\/api\/v1\/cartoes\/(\d+)\/parcelasFuturas$/);
  if (future) {
    const id = Number(future[1]);
    if (!MOCK_ACCOUNTS.items.some((a) => a.id === id && a.tipo === 'CARTAOCREDITO')) return notFound();
    // Real API: bare array (no { parcelas } wrapper, no parcelasRestantes).
    return Response.json([
      {
        id: 801,
        descricao: 'Notebook',
        valor: -250,
        data: '2026-02-16',
        parcela: '3/6',
        categoria: 10,
        tipo: 'd',
        status: 'nconciliado',
      },
    ]);
  }

  return notFound();
}

// tipoRepeticao bits, as the web app's Repetição filter sends them.
function repetitionBit(entry: Record<string, unknown>): number {
  if (!entry.parcela) return 1;
  return entry.parcela === 'fixa' ? 4 : 2;
}

/** GET /v2/lancamentos: the seeded entries of the requested accounts, dates and repetition. */
function entriesListRoute(url: URL): Response {
  const ids = (JSON.parse(url.searchParams.get('contas') ?? '{}') as { ids?: number[] }).ids ?? [];
  const from = url.searchParams.get('inicio') ?? '';
  const to = url.searchParams.get('fim') ?? '';
  const repetition = Number(url.searchParams.get('tipoRepeticao') ?? 7);
  const list = Object.values(SEEDED_ENTRIES).filter((e) => {
    const date = String(e.dataPrevista);
    // Like the real statement list (finalidade 1), card purchases are left out:
    // they only show up in the card's invoices.
    return ids.includes(Number(e.conta)) && !isCreditCardId(e.conta) && date >= from && date <= to && (repetitionBit(e) & repetition) !== 0;
  });
  return Response.json({ list, meta: { total: list.length, page: 1, pageSize: 200 } });
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
    if (isCreditCardId(body.conta)) return Response.json(createCardPurchase(body), { status: 201 });
    return Response.json(createdEntry(body, NEW_ENTRY_ID), { status: 201 });
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
    return Response.json({
      id,
      descricao: merged.descricao,
      conciliado: merged.conciliado ?? false,
      dataCompetencia: merged.dataCompetencia ?? null,
      status: statusLabel(body, merged) ?? existing.status,
      agendaId: keepsSeries ? existing.agendaId : null,
      parcela: keepsSeries ? existing.parcela : null,
      tipo: merged.tipo,
      valor: merged.valor,
      valorPrevisto: merged.valor,
      valorEfetivo: merged.valor,
      data: merged.data,
      dataPrevista: merged.dataPrevista,
      dataEfetiva: merged.dataEfetiva ?? null,
      dataCriacao: new Date().toISOString(),
      exibirCp: true,
      exibirCr: true,
      conta: transfer ? body.contaOrigem : merged.conta,
      plastico: merged.plastico,
      ...(transfer && { contaT: body.contaDestino }),
    });
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
      return cardsRoute(req, url.pathname);
    }
    if (url.pathname === '/api/v2/lancamentos' && req.method === 'GET') {
      return entriesListRoute(url);
    }
    // duplicidade lives under /lancamentos, so it has to be claimed before that prefix.
    const imported = importRoute(req.method, url);
    if (imported) return imported;
    if (url.pathname === ENTRIES_PATH || url.pathname.startsWith(`${ENTRIES_PATH}/`)) {
      return entriesRoute(req, url.pathname);
    }
    return connectionsRoute(req.method, url.pathname) ?? plasticsRoute(req.method, url.pathname) ?? notFound();
  },
});

// Line 1: port. Line 2: our own pid, so verify.sh can stop exactly this process
// even when `bun` is a wrapper script that does not exec.
console.log(`${server.port}\n${process.pid}`);
