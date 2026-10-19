import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type RecordedRequest, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, cardInvoice } from './fixtures.js';
import { statusLabel } from '../scripts/mock-entries.js';

// Finanças 2026-10-19: `entries create -p` on checking account 1167419 (date
// today) came back as id 363895476, "Status: Confirmed". In the web app
// (md.js, the entry form's save and its toast) the two toggles give three
// states: Confirmado off = no effective date or value, which the API labels
// pendente up to today and agendado after it; Confirmado on = confirmado;
// Conciliado on = conciliado. -p has to be Confirmado off.

let api: MockApi;
let home: TestHome;

const today = new Date().toLocaleDateString('en-CA');

/** Answers the POST/PUT the way the real API labels the payload it got. */
function answer(req: RecordedRequest): Record<string, unknown> {
  const body = req.body as Record<string, unknown>;
  return { id: 363895476, descricao: body.descricao, valor: body.valor, data: body.dataPrevista, dataPrevista: body.dataPrevista, status: statusLabel(body) };
}

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('POST /v1/lancamentos', answer);
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

function sentBody(): Record<string, unknown> {
  const [request] = mutations(api);
  if (!request) throw new Error('no POST/PUT was sent');
  return request.body as Record<string, unknown>;
}

describe('entries create status flags', () => {
  test('-p dated today leaves Confirmado off and comes back Pending (the reported case)', async () => {
    const result = await runCli(['entries', 'create', '-a', '1001', '-d', 'Farmácia', '-v', '42.9', '-c', '10', '-p'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(sentBody()).toMatchObject({
      status: { confirmado: false, conciliado: false },
      conciliado: false,
      dataPrevista: today,
      dataEfetiva: null,
      valorEfetivo: null,
      valorPrevisto: -42.9,
    });
    expect(result.stdout).toContain('Status: Pending');
    expect(result.stdout).not.toContain('Confirmed');
  });

  test('-p with a future date is the same payload, which the API calls Scheduled', async () => {
    const result = await runCli(['entries', 'create', '-a', '1001', '-d', 'IPVA', '-v', '800', '-c', '10', '-p', '-D', '2031-01-20'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(sentBody()).toMatchObject({ status: { confirmado: false, conciliado: false }, dataEfetiva: null, valorEfetivo: null, dataPrevista: '2031-01-20' });
    expect(result.stdout).toContain('Status: Scheduled');
  });

  test('--confirmed sends Confirmado on and Conciliado off, with the effective date and value', async () => {
    const result = await runCli(['entries', 'create', '-a', '1001', '-d', 'Feira', '-v', '30', '-c', '10', '--confirmed', '-D', '2026-01-05'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(sentBody()).toMatchObject({
      status: { confirmado: true, conciliado: false },
      conciliado: false,
      dataEfetiva: '2026-01-05',
      valorEfetivo: -30,
    });
    expect(result.stdout).toContain('Status: Confirmed');
  });

  test('no status flag still creates a reconciled entry', async () => {
    const result = await runCli(['entries', 'create', '-a', '1001', '-d', 'Feira', '-v', '30', '-c', '10', '-D', '2026-01-05'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(sentBody()).toMatchObject({ status: { confirmado: true, conciliado: true }, conciliado: true, dataEfetiva: '2026-01-05' });
    expect(result.stdout).toContain('Status: Reconciled');
  });

  test('--scheduled still works as an alias of -p and says so on stderr', async () => {
    const result = await runCli(['entries', 'create', '-a', '1001', '-d', 'IPVA', '-v', '800', '-c', '10', '-S', '-D', '2031-01-20', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(sentBody()).toMatchObject({ status: { confirmado: false, conciliado: false }, dataEfetiva: null, valorEfetivo: null });
    expect(JSON.parse(result.stdout).status).toBe('agendado');
    expect(result.stderr).toContain('--scheduled is now --pending');
  });

  test('refuses -p with --confirmed before calling the API', async () => {
    const result = await runCli(['entries', 'create', '-a', '1001', '-d', 'X', '-v', '9', '-c', '10', '-p', '--confirmed'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('either --pending or --confirmed');
    expect(mutations(api)).toHaveLength(0);
  });

  test('-p on a credit card keeps the unreconciled purchase payload and warns on stderr only', async () => {
    api.on('POST /v1/lancamentos', { id: 9, descricao: 'Voo', valor: -10, data: '2026-01-05', status: 'nconciliado', conciliado: false });
    api.on('GET /v1/cartoes/1002/fatura/2026-01-16', cardInvoice('2026-01-16', '2026-01-08'));
    api.on('GET /v1/cartoes/1002/fatura/2025-12-16', cardInvoice('2025-12-16', '2025-12-08'));

    const json = await runCli(['entries', 'create', '-a', '1002', '-d', 'Voo', '-v', '10', '-c', '10', '-D', '2026-01-05', '-p', '--json'], { home, api });

    expect(json.exitCode).toBe(0);
    expect(sentBody()).toMatchObject({
      status: { confirmado: true, conciliado: false },
      conciliado: false,
      dataCompetencia: '2026-01-05',
      dataPrevista: '2026-01-16',
      dataEfetiva: null,
      valorEfetivo: null,
    });
    expect(JSON.parse(json.stdout).conciliado).toBe(false);
    expect(json.stderr).toContain('Card purchases have no pending or confirmed state');

    // nconciliado is the card label for an unreconciled purchase; the web app calls it Confirmado.
    const text = await runCli(['entries', 'create', '-a', '1002', '-d', 'Voo', '-v', '10', '-c', '10', '-D', '2026-01-05'], { home, api });
    expect(text.exitCode).toBe(0);
    expect(text.stdout).toContain('Status: Confirmed');
  });
});

// GET /v1/lancamentos/363895476 as the reported entry would come back: -p
// created it confirmed (effective date and value filled in), dated today.
const reported = {
  id: 363895476,
  descricao: 'Farmácia',
  tipo: 'd',
  valor: -42.9,
  valorPrevisto: -42.9,
  valorEfetivo: -42.9,
  data: today,
  dataPrevista: today,
  dataEfetiva: today,
  status: 'confirmado',
  conciliado: false,
  conta: 1167419,
  categoria: 10,
  tags: [],
};

const pending = { ...reported, id: 363895477, dataEfetiva: null, valorEfetivo: null, status: 'pendente' };

describe('entries update status flags', () => {
  beforeEach(() => {
    api.on('GET /v1/lancamentos/363895476', reported);
    api.on('PUT /v1/lancamentos/363895476', answer);
    api.on('GET /v1/lancamentos/363895477', pending);
    api.on('PUT /v1/lancamentos/363895477', answer);
  });

  test('-p turns a confirmed entry back to pending', async () => {
    const result = await runCli(['entries', 'update', '363895476', '-p'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(sentBody()).toMatchObject({
      status: { confirmado: false, conciliado: false },
      conciliado: false,
      dataPrevista: today,
      dataEfetiva: null,
      valorEfetivo: null,
    });
    expect(result.stdout).toContain('Status: Pending');
  });

  test('editing a pending entry keeps it unconfirmed', async () => {
    const result = await runCli(['entries', 'update', '363895477', '-d', 'Farmácia (receita)'], { home, api });

    expect(result.exitCode).toBe(0);
    const body = sentBody();
    expect(body.status).toEqual({ confirmado: false, conciliado: false });
    expect(body.dataEfetiva ?? null).toBeNull();
    expect(body.valorEfetivo ?? null).toBeNull();
    expect(result.stdout).toContain('Status: Pending');
  });

  test('--confirmed confirms a pending entry with its planned date and value', async () => {
    const result = await runCli(['entries', 'update', '363895477', '--confirmed'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(sentBody()).toMatchObject({
      status: { confirmado: true, conciliado: false },
      conciliado: false,
      dataEfetiva: today,
      valorEfetivo: -42.9,
    });
    expect(result.stdout).toContain('Status: Confirmed');
  });

  test('refuses two status flags before calling the API', async () => {
    const result = await runCli(['entries', 'update', '363895476', '-p', '--confirmed'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('only one of --pending, --confirmed and --reconciled');
    expect(mutations(api)).toHaveLength(0);
  });
});
