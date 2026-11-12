import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE } from './fixtures.js';
import type { Entry } from '../src/types/index.js';
import { serveEntry } from './entry-routes.js';

// Real use (2026-11-09): GET /v1/lancamentos/:id answers transferencia as a
// number (the other side's ID on a transfer), while the web app's save sends a
// boolean: true for tipo t or p, false otherwise (mdb.js, Dt). Echoing the GET's
// number put the ID where the API expects the flag.

let api: MockApi;
let home: TestHome;

const expense = {
  id: 70,
  descricao: 'Café',
  tipo: 'd',
  valor: -12.5,
  data: '2026-01-12',
  dataPrevista: '2026-01-12',
  status: 'conciliado',
  conciliado: true,
  conta: 201,
  categoria: 10,
  tags: [],
  transferencia: 0,
} satisfies Entry;

const invoicePayment = { ...expense, descricao: 'Pagamento Teste', tipo: 'p', valor: -100, categoria: 30, contaT: 202, transferencia: 9 } satisfies Entry;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

function sentTransferFlag(): unknown {
  const [request] = mutations(api);
  if (!request) throw new Error('no PUT was sent');
  return (request.body as Record<string, unknown>).transferencia;
}

describe('entries update sends transferencia as the web app saves it', () => {
  test('an expense whose GET carries a numeric transferencia is sent with false', async () => {
    serveEntry(api, expense);

    const result = await runCli(['entries', 'update', '70', '-d', 'Café da manhã'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(sentTransferFlag()).toBe(false);
  });

  test("an invoice payment is sent with true, not its other side's ID", async () => {
    serveEntry(api, invoicePayment);

    const result = await runCli(['entries', 'update', '70', '-d', 'Pagamento fatura'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(sentTransferFlag()).toBe(true);
  });
});
