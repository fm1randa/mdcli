import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, SAVINGS_ACCOUNT } from './fixtures.js';

let api: MockApi;
let home: TestHome;
const created = { id: 9, descricao: 'x', valor: -10, data: '2026-01-05', status: 'confirmado' };

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', { ...ACCOUNTS_RESPONSE, items: [...ACCOUNTS_RESPONSE.items, SAVINGS_ACCOUNT] });
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('POST /v1/lancamentos', created);
  home = createHome({ ...MANUAL_AUTH, aliases: { accounts: [{ id: 1004, name: 'reserva' }], categories: [], tags: [] } });
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

function sentBody(): Record<string, unknown> {
  const [request] = mutations(api);
  if (!request) throw new Error('POST /v1/lancamentos was not called');
  return request.body as Record<string, unknown>;
}

describe('entries create -T transfer', () => {
  test('sends one entry from the origin side naming both accounts', async () => {
    const result = await runCli(
      ['entries', 'create', '-a', '1001', '-T', 'transfer', '--to-account', 'reserva', '-d', 'Reserva', '-v', '500', '-D', '2026-01-05', '--json'],
      { home, api }
    );

    expect(result.exitCode).toBe(0);
    const body = sentBody();
    expect(body).toMatchObject({
      tipo: 't',
      transferencia: true,
      contaOrigem: 1001,
      contaDestino: 1004,
      valor: -500,
      valorPrevisto: -500,
      valorEfetivo: -500,
      valorT: 500,
      valorPrevistoT: 500,
      valorEfetivoT: 500,
      // No -c: the category with tipoL 15, as the web app defaults it.
      categoria: 30,
      dataEfetiva: '2026-01-05',
      status: { confirmado: true, conciliado: true },
    });
    expect(body).not.toHaveProperty('conta');
  });

  test('refuses a transfer without --to-account before calling the API', async () => {
    const result = await runCli(['entries', 'create', '-a', '1001', '-T', 'transfer', '-d', 'X', '-v', '5'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('--to-account');
    expect(api.requests).toHaveLength(0);
  });

  test('refuses the same account on both sides', async () => {
    const result = await runCli(
      ['entries', 'create', '-a', '1004', '-T', 'transfer', '--to-account', 'reserva', '-d', 'X', '-v', '5'],
      { home, api }
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('two different accounts');
    expect(mutations(api)).toHaveLength(0);
  });

  test('refuses a transfer to a credit card (invoice payment is not modeled)', async () => {
    const result = await runCli(
      ['entries', 'create', '-a', '1001', '-T', 'transfer', '--to-account', '1002', '-d', 'Fatura', '-v', '5'],
      { home, api }
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('credit card');
    expect(mutations(api)).toHaveLength(0);
  });

  test('refuses --to-account on an expense', async () => {
    const result = await runCli(
      ['entries', 'create', '-a', '1001', '--to-account', '1004', '-d', 'X', '-v', '5', '-c', '10'],
      { home, api }
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('--to-account only applies to transfers');
    expect(api.requests).toHaveLength(0);
  });
});

describe('entries create --installments', () => {
  test('splits the total with the rounding cent on the first installment, months clamped', async () => {
    const result = await runCli(
      ['entries', 'create', '-a', '1001', '-d', 'Geladeira', '-v', '100', '-c', '10', '-i', '3', '-D', '2026-01-31', '--json'],
      { home, api }
    );

    expect(result.exitCode).toBe(0);
    expect(sentBody()).toMatchObject({
      agenda: { repeticao: 'p', intervalo: 'M', quantidade: 3, frequencia: 1, inicial: 1 },
      parcelas: [
        { valor: -33.34, data: '2026-01-31' },
        { valor: -33.33, data: '2026-02-28' },
        { valor: -33.33, data: '2026-03-31' },
      ],
      valor: -100,
      valorPrevisto: -100,
      valorEfetivo: -33.34,
      dataEfetiva: '2026-01-31',
    });
  });

  test('sends the series total as the signed sum of the installments', async () => {
    // 0.07 in 10 is 0.07 - 9 * 0.01 = -0.02 on the first installment, the opposite sign of the rest.
    const income = await runCli(
      ['entries', 'create', '-a', '1001', '-d', 'Centavos', '-v', '0.07', '-c', '10', '-T', 'income', '-i', '10', '-D', '2026-01-10', '--json'],
      { home, api }
    );
    const expense = await runCli(
      ['entries', 'create', '-a', '1001', '-d', 'Centavos', '-v', '0.07', '-c', '10', '-i', '10', '-D', '2026-01-10', '--json'],
      { home, api }
    );

    expect(income.exitCode).toBe(0);
    expect(expense.exitCode).toBe(0);
    const [incomeBody, expenseBody] = mutations(api).map((request) => request.body);
    expect(incomeBody).toMatchObject({ valor: 0.07, valorPrevisto: 0.07 });
    expect(expenseBody).toMatchObject({ valor: -0.07, valorPrevisto: -0.07 });
  });

  test('--per-installment, --frequency and --first-installment', async () => {
    const result = await runCli(
      [
        'entries', 'create', '-a', '1001', '-d', 'Curso', '-v', '50', '-c', '10', '-T', 'income',
        '-i', '4', '--per-installment', '--frequency', '2', '--first-installment', '2', '-D', '2026-01-10',
      ],
      { home, api }
    );

    expect(result.exitCode).toBe(0);
    expect(sentBody()).toMatchObject({
      agenda: { repeticao: 'p', intervalo: 'M', quantidade: 4, frequencia: 2, inicial: 2 },
      parcelas: [
        { valor: 50, data: '2026-01-10' },
        { valor: 50, data: '2026-03-10' },
        { valor: 50, data: '2026-05-10' },
        { valor: 50, data: '2026-07-10' },
      ],
      valor: 200,
    });
  });

  test('describes the split in text output', async () => {
    const result = await runCli(
      ['entries', 'create', '-a', '1001', '-d', 'Geladeira', '-v', '100', '-c', '10', '-i', '3', '-D', '2026-01-31'],
      { home, api }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.replace(/\u00a0/g, ' ')).toContain('Installments: 1x -R$ 33,34 + 2x -R$ 33,33 (monthly, every 1)');
  });

  test('refuses --times with --installments and a single installment', async () => {
    const both = await runCli(['entries', 'create', '-a', '1001', '-d', 'X', '-v', '9', '-c', '10', '-i', '3', '--times', '3'], { home, api });
    const one = await runCli(['entries', 'create', '-a', '1001', '-d', 'X', '-v', '9', '-c', '10', '-i', '1'], { home, api });

    expect(both.exitCode).toBe(1);
    expect(both.output).toContain('--times is for a fixed series');
    expect(one.exitCode).toBe(1);
    expect(one.output).toContain('Invalid --installments: 1');
    expect(api.requests).toHaveLength(0);
  });
});

describe('entries create --repeat', () => {
  test('accepts --frequency together with --times', async () => {
    const result = await runCli(
      ['entries', 'create', '-a', '1001', '-d', 'Academia', '-v', '90', '-c', '10', '-r', 'monthly', '--frequency', '2', '--times', '6', '--json'],
      { home, api }
    );

    expect(result.exitCode).toBe(0);
    expect(sentBody()).toMatchObject({
      agenda: { repeticao: 'f', intervalo: 'M', quantidade: 6, frequencia: 2, inicial: 1 },
      valor: -90,
    });
    expect(sentBody()).not.toHaveProperty('parcelas');
  });
});

describe('entries create --scheduled', () => {
  test('sends confirmado and conciliado off with no effective date or value', async () => {
    api.on('POST /v1/lancamentos', { ...created, status: 'agendado' });

    const result = await runCli(
      ['entries', 'create', '-a', '1001', '-d', 'IPVA', '-v', '800', '-c', '10', '-S', '-D', '2026-11-05'],
      { home, api }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Scheduled');
    expect(sentBody()).toMatchObject({
      status: { confirmado: false, conciliado: false },
      conciliado: false,
      dataPrevista: '2026-11-05',
      dataEfetiva: null,
      valorEfetivo: null,
      valorPrevisto: -800,
    });
  });

  test('refuses --scheduled with --confirmed before calling the API', async () => {
    const both = await runCli(['entries', 'create', '-a', '1001', '-d', 'X', '-v', '9', '-c', '10', '-S', '--confirmed'], { home, api });

    expect(both.exitCode).toBe(1);
    expect(both.output).toContain('either --pending or --confirmed');
    expect(mutations(api)).toHaveLength(0);
  });
});
