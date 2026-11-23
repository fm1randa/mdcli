import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, EMPTY_ENTRIES_RESPONSE } from './fixtures.js';
import { entryAnswer } from './entry-routes.js';
import type { Entry } from '../src/types/index.js';

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('GET /v2/lancamentos', EMPTY_ENTRIES_RESPONSE);
  home = createHome({
    ...MANUAL_AUTH,
    aliases: { accounts: [{ id: 201, name: 'conta' }], categories: [], tags: [] },
  });
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

describe('entries update', () => {
  const updated = {
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
      conta: 201,
      contaT: 203,
      categoria: 30,
      tags: [],
      observacoes: '',
    } satisfies Entry;
    api.on('GET /v1/lancamentos/50', transferOrigin);
    api.on('PUT /v1/lancamentos/50', entryAnswer(50, { ...updated, descricao: 'Poupança mensal', valor: -1200 }));

    const result = await runCli(
      ['entries', 'update', '50', '-d', 'Poupança mensal', '-v', '1200', '--json'],
      { home, api }
    );

    expect(result.exitCode).toBe(0);
    const body = mutations(api)[0].body as Record<string, unknown>;
    expect(body).toMatchObject({
      transferencia: true,
      conta: 201,
      contaT: 203,
      contaOrigem: 201,
      contaDestino: 203,
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
      conta: 203,
      contaT: 201,
      categoria: 30,
      tags: [],
    } satisfies Entry;
    api.on('GET /v1/lancamentos/51', transferDestination);
    api.on('PUT /v1/lancamentos/51', entryAnswer(51, { ...updated, valor: -1000 }));

    const result = await runCli(
      ['entries', 'update', '51', '-n', 'via CLI', '--json'],
      { home, api }
    );

    expect(result.exitCode).toBe(0);
    const body = mutations(api)[0].body as Record<string, unknown>;
    expect(body).toMatchObject({
      transferencia: true,
      contaOrigem: 201,
      contaDestino: 203,
      conta: 201,
      contaT: 203,
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
      conta: 201,
      categoria: 10,
      categoriaPai: 0,
      parcela: '2/6',
      agendaId: 99,
      plastico: 62,
      tags: [501],
      observacoes: 'parcelado',
      ndocumento: 'NF-1',
      lembrete: 0,
      automatico: false,
      exibirCp: true,
      exibirCr: true,
      estorno: false,
      transferencia: 0,
    } satisfies Entry;
    api.on('GET /v1/lancamentos/60', installment);
    api.on('PUT /v1/lancamentos/60', entryAnswer(60, { ...updated, descricao: 'Notebook (2/6)' }));

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
      plastico: 62,
      categoria: 10,
      tags: [501],
    });
  });
});
