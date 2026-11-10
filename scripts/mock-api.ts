// Local HTTP server that mimics the Meu Dinheiro API for scripts/verify.sh.
// Uses the same fixtures as the unit tests; never touches the real API.
import type { Account, AccountsResponse, CategoriesResponse } from '../src/types/index.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, CREDIT_CARD_ACCOUNT, SAVINGS_ACCOUNT, TAGS_RESPONSE } from '../test/fixtures.js';
import { plasticsRoute } from './mock-plastics.js';
import { ENTRIES_PATH, entriesListRoute, entriesRoute } from './mock-entries.js';
import { badRequest, idOf, notFound, readJsonBody, requiredNumber } from './mock-http.js';
import { connectionsRoute, recordMockRequest } from './mock-connections.js';
import { importRoute, withRecentStatement } from './mock-import.js';
import { balancesRoute } from './mock-balances.js';
import { cardsRoute } from './mock-cards.js';
import { sessionRoute } from './mock-session.js';
import { CLOSED_INVOICE_CARD } from './mock-closed-invoice.js';

// GitHub "latest release" endpoint used by the self-updater (no auth).
const MOCK_LATEST_TAG = 'v2099.1.1';
const LATEST_RELEASE_PATH = '/github/repos/fm1randa/mdcli/releases/latest';

const ACCOUNTS_PATH = '/api/v1/cadastros/contas';
const CATEGORIES_PATH = '/api/v1/cadastros/categorias';
const TAGS_PATH = '/api/v1/cadastros/tags';
const NEW_ACCOUNT_ID = 2001;

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
  items: [...ACCOUNTS_RESPONSE.items.map(withRecentStatement), CARD_NO_DUE, SAVINGS_ACCOUNT, CARD_DATE_ONLY, CLOSED_INVOICE_CARD],
};

function accountType(tipoNovo: unknown) {
  return MOCK_ACCOUNTS.meta.tipos.find((t) => t.id === tipoNovo);
}

function accountOf(conta: unknown): Account | undefined {
  const id = idOf(conta);
  return MOCK_ACCOUNTS.items.find((a) => a.id === id);
}

function accountTipo(conta: unknown): string | undefined {
  return accountOf(conta)?.tipo;
}

function isCreditCardId(conta: unknown): boolean {
  return accountTipo(conta) === 'CARTAOCREDITO';
}

async function accountsRoute(req: Request, path: string): Promise<Response> {
  if (path === ACCOUNTS_PATH) {
    if (req.method === 'GET') return Response.json(MOCK_ACCOUNTS);
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      if (body instanceof Response) return body;
      const nome = body.nome;
      const type = accountType(body.tipoNovo);
      if (typeof nome !== 'string' || !nome) return badRequest('nome is required');
      if (!type) return badRequest(`unknown tipoNovo ${String(body.tipoNovo)}`);
      const tipo = type.nome;
      const created: Account = {
        id: NEW_ACCOUNT_ID,
        nome,
        tipo,
        tipoNovo: type.id,
        status: true,
        encerrada: false,
        exibirBP: body.exibirBP !== false,
        apenasTransferencia: false,
        saldoInicial: requiredNumber(body.saldoInicial ?? 0, 'saldoInicial'),
        moeda: requiredNumber(body.moeda ?? 1, 'moeda'),
        dataSaldoInicial: typeof body.dataSaldoInicial === 'string' ? body.dataSaldoInicial : undefined,
        considerarCarteiraInvestimentos: 1,
        liquidez: requiredNumber(body.liquidez ?? 1, 'liquidez'),
        permissoes: { visivel: true, acoes: { editar: true, excluir: true } },
        ...(typeof body.banco === 'string' && { banco: { id: body.banco, nome: body.banco, img: '', tipo: [tipo] } }),
      };
      return Response.json(created, { status: 201 });
    }
    return notFound();
  }

  const match = path.match(/^\/api\/v1\/cadastros\/contas\/(\d+)$/);
  const existing = match && accountOf(match[1]);
  if (!existing) return notFound();

  if (req.method === 'PUT') {
    const body = await readJsonBody(req);
    if (body instanceof Response) return body;
    const { banco: _banco, ...changes } = body;
    const updated: Account = { ...existing, ...changes, id: existing.id, tipo: accountType(changes.tipoNovo)?.nome ?? existing.tipo };
    return Response.json(updated);
  }
  if (req.method === 'DELETE') {
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
      return url.searchParams.get('type') === 'sum' ? balancesRoute(url, isCreditCardId) : entriesListRoute(url, accountTipo);
    }
    // duplicidade lives under /lancamentos, so it has to be claimed before that prefix.
    const imported = importRoute(req.method, url);
    if (imported) return imported;
    if (url.pathname === ENTRIES_PATH || url.pathname.startsWith(`${ENTRIES_PATH}/`)) {
      return entriesRoute(req, url.pathname, accountTipo);
    }
    return connectionsRoute(req.method, url.pathname) ?? plasticsRoute(req.method, url.pathname) ?? sessionRoute(req.method, url.pathname) ?? notFound();
  },
});

// Line 1: port. Line 2: our own pid, so verify.sh can stop exactly this process
// even when `bun` is a wrapper script that does not exec.
console.log(`${server.port}\n${process.pid}`);
