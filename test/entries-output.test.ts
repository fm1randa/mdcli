import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, TAGS_RESPONSE, entriesPage } from './fixtures.js';

// Jardinagem 2026-10-19: values shown without sign in create/update/delete
// (the #72 bug, left outside list), tag resolution copied three times,
// reportCreate not reading a status object and unknown statuses shown as Pending.
let api: MockApi;
let home: TestHome;

const coffee = {
  id: 70,
  descricao: 'Café',
  tipo: 'd',
  valor: -12.5,
  data: '2026-01-12',
  dataPrevista: '2026-01-12',
  status: 'conciliado',
  conciliado: true,
  conta: 1001,
  categoria: 10,
  tags: [],
};

const text = (s: string): string => s.replace(/\u00a0/g, ' ');

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('GET /v1/cadastros/tags', TAGS_RESPONSE);
  api.on('POST /v1/lancamentos', { id: 9, descricao: 'Feira', valor: -30, data: '2026-01-05', status: 'conciliado' });
  api.on('GET /v1/lancamentos/70', coffee);
  api.on('PUT /v1/lancamentos/70', (req) => ({ ...coffee, ...(req.body as object) }));
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

describe('signed values', () => {
  test('entries create shows an income as positive', async () => {
    api.on('POST /v1/lancamentos', { id: 9, descricao: 'Salário', valor: 150, data: '2026-01-05', status: 'conciliado' });
    const result = await runCli(['entries', 'create', '-a', '1001', '-d', 'Salário', '-v', '150', '-c', '20', '-T', 'income', '-D', '2026-01-05'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(text(result.stdout)).toContain('Value: R$ 150,00');
  });

  test('entries create shows an expense as negative', async () => {
    const result = await runCli(['entries', 'create', '-a', '1001', '-d', 'Feira', '-v', '30', '-c', '10', '-D', '2026-01-05'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(text(result.stdout)).toContain('Value: -R$ 30,00');
  });

  test('entries update shows an expense as negative', async () => {
    const result = await runCli(['entries', 'update', '70', '-d', 'Café coado'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(text(result.stdout)).toContain('Value: -R$ 12,50');
  });

  test('entries delete confirmation shows an expense as negative', async () => {
    const result = await runCli(['entries', 'delete', '70'], { home, api, stdin: 'n\n' });

    expect(text(result.stdout)).toContain('Value: -R$ 12,50');
    expect(mutations(api)).toHaveLength(0);
  });

  test('entries summary keeps Income and Expenses as magnitudes and Net signed', async () => {
    api.on(
      'GET /v2/lancamentos',
      entriesPage([
        { ...coffee, id: 1, tipo: 'r', valor: 100, categoria: 20 },
        { ...coffee, id: 2, valor: -130 },
      ])
    );

    const result = await runCli(['entries', 'summary', '-a', '1001', '-f', '2026-01-01', '-t', '2026-01-31'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(text(result.stdout)).toMatch(/│ Total +│ 2 +│ R\$ 100,00 +│ R\$ 130,00 +│ -R\$ 30,00 +│/);
  });
});

describe('unknown tags', () => {
  const cases: Array<[string, string[]]> = [
    ['entries create', ['entries', 'create', '-a', '1001', '-d', 'X', '-v', '1', '-c', '10', '-g', 'Trabalho,nope']],
    ['entries update', ['entries', 'update', '70', '-g', 'nope']],
    ['entries list', ['entries', 'list', '-a', '1001', '-g', 'nope']],
  ];
  for (const [name, args] of cases) {
    test(`${name} names the tag that matches nothing`, async () => {
      const result = await runCli(args, { home, api });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown tag(s): nope');
      expect(mutations(api)).toHaveLength(0);
    });
  }
});

describe('status labels', () => {
  test('entries create reads a status object in the answer', async () => {
    api.on('POST /v1/lancamentos', {
      id: 9,
      descricao: 'Feira',
      valor: -30,
      data: '2026-01-05',
      status: { confirmado: true, conciliado: false },
    });

    const result = await runCli(['entries', 'create', '-a', '1001', '-d', 'Feira', '-v', '30', '-c', '10', '-D', '2026-01-05'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Status: Confirmed');
  });

  test('a status outside the table is unknown, not pending', async () => {
    api.on('GET /v2/lancamentos', entriesPage([{ ...coffee, status: 'estornado' }]));

    const json = await runCli(['entries', 'list', '-a', '1001', '-f', '2026-01-01', '-t', '2026-01-31', '--json'], { home, api });
    const table = await runCli(['entries', 'list', '-a', '1001', '-f', '2026-01-01', '-t', '2026-01-31'], { home, api });

    expect(JSON.parse(json.stdout)[0].status).toBe('unknown');
    expect(table.stdout).toContain('Unknown');
    expect(table.stdout).not.toContain('Pending');
  });
});
