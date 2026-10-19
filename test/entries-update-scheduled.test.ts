import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

const confirmedExpense = {
  id: 70,
  descricao: 'Café',
  tipo: 'd',
  valor: -12.5,
  valorPrevisto: -12.5,
  valorEfetivo: -12.5,
  data: '2026-01-12',
  dataPrevista: '2026-01-12',
  dataEfetiva: '2026-01-12',
  status: 'conciliado',
  conciliado: true,
  conta: 1001,
  categoria: 10,
  tags: [],
};

describe('entries update --pending (and its old name --scheduled)', () => {
  test('turns a reconciled entry back into an unconfirmed one (pending: its date is past)', async () => {
    api.on('GET /v1/lancamentos/70', confirmedExpense);
    api.on('PUT /v1/lancamentos/70', { ...confirmedExpense, status: 'pendente' });

    const result = await runCli(['entries', 'update', '70', '--pending'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Status: Pending');
    expect(mutations(api)[0].body).toMatchObject({
      status: { confirmado: false, conciliado: false },
      conciliado: false,
      dataEfetiva: null,
      valorEfetivo: null,
      dataPrevista: '2026-01-12',
    });
  });

  test('clears both halves of a transfer', async () => {
    const transfer = {
      ...confirmedExpense,
      id: 50,
      tipo: 't',
      valor: -1000,
      valorT: 1000,
      valorEfetivoT: 1000,
      conta: 1001,
      contaT: 1004,
      categoria: 30,
    };
    api.on('GET /v1/lancamentos/50', transfer);
    api.on('PUT /v1/lancamentos/50', { ...transfer, status: 'agendado' });

    const result = await runCli(['entries', 'update', '50', '-S', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(mutations(api)[0].body).toMatchObject({
      transferencia: true,
      status: { confirmado: false, conciliado: false },
      dataEfetiva: null,
      valorEfetivo: null,
      valorEfetivoT: null,
    });
  });

  test('refuses --scheduled together with --confirmed before calling the API', async () => {
    const result = await runCli(['entries', 'update', '70', '-S', '--confirmed'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('only one of --pending, --confirmed and --reconciled');
    expect(api.requests).toHaveLength(0);
  });
});
