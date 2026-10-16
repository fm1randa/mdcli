import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, CREDIT_CARD_ACCOUNT, EMPTY_ENTRIES_RESPONSE, cardInvoice } from './fixtures.js';

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('GET /v2/lancamentos', EMPTY_ENTRIES_RESPONSE);
  home = createHome({
    ...MANUAL_AUTH,
    aliases: { accounts: [{ id: 1001, name: 'nu' }], categories: [], tags: [] },
  });
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

function entriesQuery(): URLSearchParams {
  const request = api.requests.find((r) => r.path === '/v2/lancamentos');
  if (!request) throw new Error('entries endpoint was not called');
  return request.query;
}

describe('entries list', () => {
  test('turns status and type names into the API bitmasks', async () => {
    const result = await runCli(
      ['entries', 'list', '-a', '1001', '-s', 'pending,reconciled', '-T', 'expense,income', '--json'],
      { home, api }
    );

    expect(result.exitCode).toBe(0);
    expect(entriesQuery().get('status')).toBe('5');
    expect(entriesQuery().get('tipoLancamento')).toBe('3');
  });

  test('resolves account aliases and category names', async () => {
    const result = await runCli(
      ['entries', 'list', '-a', 'nu', '-c', 'alimentação/mercado', '--from', '2026-01-01', '--to', '2026-01-31', '--json'],
      { home, api }
    );

    expect(result.exitCode).toBe(0);
    const query = entriesQuery();
    expect(JSON.parse(query.get('contas') ?? '')).toEqual({ faturas: true, ids: [1001] });
    expect(JSON.parse(query.get('categorias') ?? '')).toEqual({ ids: ['11'] });
    expect(query.get('inicio')).toBe('2026-01-01');
    expect(query.get('fim')).toBe('2026-01-31');
  });

  test('rejects an unknown status name before calling the API', async () => {
    const result = await runCli(['entries', 'list', '-a', '1001', '-s', 'done'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Unknown status: done');
    expect(api.requests.some((r) => r.path === '/v2/lancamentos')).toBe(false);
  });

  test('rejects an unknown account', async () => {
    const result = await runCli(['entries', 'list', '-a', 'nope'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Unknown account(s): nope');
  });
});

describe('entries create', () => {
  const created = { id: 9, descricao: 'x', valor: -10, data: '2026-01-05', status: 'conciliado' };

  test('sends expenses as negative values and omits dataCompetencia on a regular account', async () => {
    api.on('POST /v1/lancamentos', created);

    const result = await runCli(
      ['entries', 'create', '-a', '1001', '-d', 'Mercado', '-v', '10', '-c', '10', '-D', '2026-01-05', '--json'],
      { home, api }
    );

    expect(result.exitCode).toBe(0);
    const body = mutations(api)[0].body as Record<string, unknown>;
    expect(body).toMatchObject({ conta: '1001', categoria: 10, tipo: 'd', valor: -10, dataEfetiva: '2026-01-05' });
    expect(body).not.toHaveProperty('dataCompetencia');
  });

  test('puts a credit card purchase on the open invoice', async () => {
    api.on('POST /v1/lancamentos', created);
    api.on('GET /v1/cartoes/1002/fatura/2026-01-16', cardInvoice('2026-01-16', '2026-01-08'));
    api.on('GET /v1/cartoes/1002/fatura/2025-12-16', cardInvoice('2025-12-16', '2025-12-08'));

    const result = await runCli(
      ['entries', 'create', '-a', '1002', '-d', 'Voo', '-v', '10', '-c', '10', '-D', '2026-01-05', '--json'],
      { home, api }
    );

    expect(result.exitCode).toBe(0);
    expect(mutations(api)[0].body).toMatchObject({
      dataCompetencia: '2026-01-05',
      dataPrevista: '2026-01-16',
      dataEfetiva: null,
      conciliado: false,
    });
  });

  test('refuses a card purchase when the card has no next due date', async () => {
    api.on('GET /v1/cadastros/contas', {
      ...ACCOUNTS_RESPONSE,
      items: [{ ...CREDIT_CARD_ACCOUNT, proximoVencimento: undefined }],
    });

    const result = await runCli(
      ['entries', 'create', '-a', '1002', '-d', 'Voo', '-v', '10', '-c', '10', '-D', '2026-01-05'],
      { home, api }
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Card 1002 has no next due date');
    expect(mutations(api)).toHaveLength(0);
  });

  test('shows an unreconciled entry (-p) as Pending, the way list does', async () => {
    // Real API answer for `entries create -p` on 2026-10-16: status "confirmado".
    api.on('POST /v1/lancamentos', { ...created, status: 'confirmado', conciliado: false, dataEfetiva: '2026-11-05' });

    const result = await runCli(
      ['entries', 'create', '-a', '1001', '-d', 'Mercado', '-v', '1', '-c', '10', '-D', '2026-11-05', '-p'],
      { home, api }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Pending');
    expect(result.output).not.toContain('Scheduled');
    expect(mutations(api)[0].body).toMatchObject({ status: { confirmado: true, conciliado: false }, conciliado: false });
  });

  test('requires a category', async () => {
    const result = await runCli(['entries', 'create', '-a', '1001', '-d', 'X', '-v', '10'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(mutations(api)).toHaveLength(0);
  });
});

describe('entries update', () => {
  const updated = {
    id: 50,
    descricao: 'Atualizado',
    valor: -80,
    data: '2026-01-20',
    status: 'conciliado',
  };

  test('rewrites a transfer from the origin half with contaOrigem/contaDestino', async () => {
    const transferOrigin = {
      id: 50,
      descricao: 'Poupança',
      tipo: 't',
      valor: -1000,
      valorT: 1000,
      data: '2026-01-15',
      dataPrevista: '2026-01-15',
      dataEfetiva: '2026-01-15',
      status: 'conciliado',
      conciliado: true,
      conta: 1001,
      contaT: 1003,
      categoria: 30,
      tags: [],
      observacoes: '',
    };
    api.on('GET /v1/lancamentos/50', transferOrigin);
    api.on('PUT /v1/lancamentos/50', { ...updated, id: 50, descricao: 'Poupança mensal', valor: -1200 });

    const result = await runCli(
      ['entries', 'update', '50', '-d', 'Poupança mensal', '-v', '1200', '--json'],
      { home, api }
    );

    expect(result.exitCode).toBe(0);
    const body = mutations(api)[0].body as Record<string, unknown>;
    expect(body).toMatchObject({
      transferencia: true,
      conta: 1001,
      contaT: 1003,
      contaOrigem: 1001,
      contaDestino: 1003,
      valor: -1200,
      valorT: 1200,
      descricao: 'Poupança mensal',
    });
    expect(body).not.toHaveProperty('tipo');
  });

  test('flips a transfer destination half to the origin side before PUT', async () => {
    const transferDestination = {
      id: 51,
      descricao: 'Poupança',
      tipo: 't',
      valor: 1000,
      valorT: -1000,
      data: '2026-01-15',
      dataPrevista: '2026-01-15',
      status: 'conciliado',
      conciliado: true,
      conta: 1003,
      contaT: 1001,
      categoria: 30,
      tags: [],
    };
    api.on('GET /v1/lancamentos/51', transferDestination);
    api.on('PUT /v1/lancamentos/51', { ...updated, id: 51, valor: -1000 });

    const result = await runCli(
      ['entries', 'update', '51', '-n', 'via CLI', '--json'],
      { home, api }
    );

    expect(result.exitCode).toBe(0);
    const body = mutations(api)[0].body as Record<string, unknown>;
    expect(body).toMatchObject({
      transferencia: true,
      contaOrigem: 1001,
      contaDestino: 1003,
      conta: 1001,
      contaT: 1003,
      valor: -1000,
      valorT: 1000,
      observacoes: 'via CLI',
    });
  });

  test('echoes an installment entry and layers the description change', async () => {
    const installment = {
      id: 60,
      descricao: 'Notebook',
      tipo: 'd',
      valor: -250,
      data: '2026-01-10',
      dataPrevista: '2026-01-10',
      dataEfetiva: '2026-01-10',
      dataCompetencia: '2026-01-10',
      status: 'conciliado',
      conciliado: true,
      conta: 1001,
      categoria: 10,
      categoriaPai: 0,
      parcela: '2/6',
      agendaId: 99,
      plastico: 7,
      tags: [501],
      observacoes: 'parcelado',
      ndocumento: 'NF-1',
      lembrete: 0,
      automatico: false,
      exibirCp: true,
      exibirCr: true,
      estorno: false,
      transferencia: false,
    };
    api.on('GET /v1/lancamentos/60', installment);
    api.on('PUT /v1/lancamentos/60', { ...updated, id: 60, descricao: 'Notebook (2/6)' });

    const result = await runCli(
      ['entries', 'update', '60', '-d', 'Notebook (2/6)', '--json'],
      { home, api }
    );

    expect(result.exitCode).toBe(0);
    const body = mutations(api)[0].body as Record<string, unknown>;
    expect(body).toMatchObject({
      id: 60,
      descricao: 'Notebook (2/6)',
      tipo: 'd',
      valor: -250,
      parcela: '2/6',
      agendaId: 99,
      plastico: 7,
      categoria: 10,
      tags: [501],
    });
  });
});
