import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type RecordedRequest, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE } from './fixtures.js';
import { CONNECTIONS, SINCE } from './import-harness.js';

const TX = '12121212-1111-4000-8000-000000000001';
const FORBIDDEN = [
  'moeda', 'status', 'tipoLancamento', 'type', 'pendentesPresente', 'apenasMetasDefinidas',
  'ordenarMesmaData', 'categorias', 'tags', 'palavras', 'valor',
];

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/integracao/connections', CONNECTIONS);
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('GET /v1/lancamentos/duplicidade', {});
  api.on('GET /v2/lancamentos', { list: [], meta: { total: 0, page: 1, pageSize: 500 } });
  api.on('GET /v1/integracao/account/9001/transactions', {
    inicio: '2026-10-01',
    fim: '2026-10-10',
    saldo: 0,
    lancamentos: [{
      integrationId: TX,
      descricao: 'Pagamento Ficticio',
      valor: -12.34,
      data: '2026-10-07',
      moeda: 1,
      _ca: { c: { d: { categoria: { v: 10 } } } },
    }],
  });
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

function cli(args: string[]) {
  return runCli(args, { home, api });
}

function list(args: string[] = []) {
  return cli(['entries', 'import', 'list', '-a', '1001', '--since', SINCE, '--json', ...args]);
}

function expectCandidateQuery(request: RecordedRequest, from: string, to: string, page: number) {
  expect(request.method).toBe('GET');
  expect(request.path).toBe('/v2/lancamentos');
  expect([...request.query.keys()].sort()).toEqual(['contas', 'fim', 'finalidade', 'inicio', 'list']);
  expect(request.query.get('finalidade')).toBe('3');
  expect(request.query.getAll('finalidade')).toEqual(['3']);
  expect(request.query.get('inicio')).toBe(from);
  expect(request.query.get('fim')).toBe(to);
  expect(JSON.parse(request.query.get('contas') ?? 'null')).toEqual({ ids: [1001] });
  expect(JSON.parse(request.query.get('list') ?? 'null')).toEqual({ page, pageSize: 500 });
  expect(request.query.toString()).not.toContain('finalidade=1');
  expect(request.query.get('contas')).not.toContain('1002');
  expect(request.query.get('contas')).not.toContain('9001');
  for (const key of FORBIDDEN) expect(request.query.has(key)).toBe(false);
}

describe('entries import list candidate query', () => {
  test('keeps paging past 20 pages until meta.total is covered', async () => {
    api.on('GET /v2/lancamentos', (req) => {
      const page = JSON.parse(req.query.get('list') ?? '{}').page as number;
      const value = page === 25 ? -12.34 : -99;
      return { list: [{ id: 7000 + page, dataPrevista: '2026-10-07', valor: value }], meta: { total: 25 } };
    });

    const result = await list();

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(api.requests.filter((r) => r.path === '/v2/lancamentos')).toHaveLength(25);
    const [row] = JSON.parse(result.stdout).transactions;
    expect(row.candidates.map((item: { id: number }) => item.id)).toEqual([7025]);
    expect(row.defaultAction).toBe('conciliate');
  });

  test('a candidate search that never ends fails instead of listing a truncated result', async () => {
    api.on('GET /v2/lancamentos', (req) => {
      const page = JSON.parse(req.query.get('list') ?? '{}').page as number;
      return { list: [{ id: 7000 + page, dataPrevista: '2026-10-07', valor: -99 }], meta: { total: 1_000_000 } };
    });

    const result = await list();

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr).error).toContain('GET /v2/lancamentos');
    expect(mutations(api)).toHaveLength(0);
  });

  test('requests the next page when meta.total is larger than the first list', async () => {
    api.on('GET /v2/lancamentos', (req) => {
      const page = JSON.parse(req.query.get('list') ?? '{}').page as number;
      if (page === 1) {
        return {
          list: [{ id: 7101, dataPrevista: '2026-10-07', valor: -12.34, descricao: 'Pagina 1', categoria: 10 }],
          meta: { total: 2, page: 1, pageSize: 500 },
        };
      }
      return {
        list: [{ id: 7102, dataPrevista: '2026-10-08', valor: -12.34, descricao: 'Pagina 2', categoria: 11 }],
        meta: { total: 2, page: 2, pageSize: 500 },
      };
    });

    const result = await list();

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const calls = api.requests.filter((r) => r.path === '/v2/lancamentos');
    expect(calls).toHaveLength(2);
    expectCandidateQuery(calls[0], '2026-09-29', '2026-10-12', 1);
    expectCandidateQuery(calls[1], '2026-09-29', '2026-10-12', 2);
    expect(JSON.parse(result.stdout).transactions[0].candidates).toEqual([
      { id: 7101, date: '2026-10-07', value: -12.34, description: 'Pagina 1', categoryId: 10 },
      { id: 7102, date: '2026-10-08', value: -12.34, description: 'Pagina 2', categoryId: 11 },
    ]);
    expect(JSON.parse(result.stdout).transactions[0].defaultAction).toBe('conciliate');
    expect(JSON.parse(result.stdout).ai).toBe('unused');
    expect(api.requests.some((r) => /smartmatch|markImported|importar|conciliacao|regras/.test(r.path))).toBe(false);
    expect(mutations(api)).toHaveLength(0);
  });

  test('drops an entry that is within two days but outside the search window', async () => {
    api.on('GET /v2/lancamentos', {
      list: [{ id: 4246, dataPrevista: '2026-10-05', valor: -12.34, descricao: 'Fora', categoria: 10 }],
      meta: { total: 1, page: 1, pageSize: 500 },
    });

    const result = await list(['--search-from', '2026-10-07', '--search-to', '2026-10-08']);

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.search).toEqual({ from: '2026-10-07', to: '2026-10-08' });
    expect(body.transactions[0].candidates).toEqual([]);
    expect(body.transactions[0].defaultAction).toBe('import');
    const calls = api.requests.filter((r) => r.path === '/v2/lancamentos');
    expect(calls).toHaveLength(1);
    expectCandidateQuery(calls[0], '2026-10-07', '2026-10-08', 1);
  });

  test('does not search candidates when the statement has no transactions', async () => {
    api.on('GET /v1/integracao/account/9001/transactions', {
      inicio: '2026-10-01', fim: '2026-10-10', saldo: 0, lancamentos: [],
    });

    const result = await list();

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout).transactions).toEqual([]);
    expect(JSON.parse(result.stdout).search).toEqual({ from: '2026-09-29', to: '2026-10-12' });
    expect(api.requests.some((r) => r.path === '/v2/lancamentos')).toBe(false);
    expect(mutations(api)).toHaveLength(0);
  });

  test('does not invent a window when the statement has no dates', async () => {
    api.on('GET /v1/integracao/account/9001/transactions', {
      saldo: 1,
      lancamentos: [{
        integrationId: TX, descricao: 'Pagamento Ficticio', valor: -12.34, data: '2026-10-07', moeda: 1,
      }],
    });
    api.on('GET /v2/lancamentos', {
      list: [{ id: 4242, dataPrevista: '2026-10-07', valor: -12.34 }],
      meta: { total: 1, page: 1, pageSize: 500 },
    });

    const bare = await list();
    expect(bare.exitCode).toBe(0);
    expect(JSON.parse(bare.stdout).search).toEqual({ from: null, to: null });
    expect(JSON.parse(bare.stdout).transactions[0].candidates).toEqual([]);
    expect(api.requests.some((r) => r.path === '/v2/lancamentos')).toBe(false);

    api.requests.length = 0;
    const oneSide = await list(['--search-to', '2026-10-20']);
    expect(oneSide.exitCode).toBe(0);
    expect(JSON.parse(oneSide.stdout).search).toEqual({ from: null, to: '2026-10-20' });
    expect(JSON.parse(oneSide.stdout).transactions[0].candidates).toEqual([]);
    expect(api.requests.some((r) => r.path === '/v2/lancamentos')).toBe(false);

    api.requests.length = 0;
    const both = await list(['--search-from', '2026-09-29', '--search-to', '2026-10-20']);
    expect(both.exitCode).toBe(0);
    const body = JSON.parse(both.stdout);
    expect(body.search).toEqual({ from: '2026-09-29', to: '2026-10-20' });
    expect(body.transactions[0].candidates).toEqual([
      { id: 4242, date: '2026-10-07', value: -12.34, description: null, categoryId: null },
    ]);
    expect(body.transactions[0].defaultAction).toBe('conciliate');
    const calls = api.requests.filter((r) => r.path === '/v2/lancamentos');
    expect(calls).toHaveLength(1);
    expectCandidateQuery(calls[0], '2026-09-29', '2026-10-20', 1);
    expect(mutations(api)).toHaveLength(0);
  });

  test('rejects one flag that puts the search start after the end and does not search candidates', async () => {
    const result = await list(['--search-from', '2026-10-20']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({
      error: 'Search start 2026-10-20 is after search end 2026-10-12.',
    });
    expect(api.requests.some((r) => r.path.includes('/transactions'))).toBe(true);
    expect(api.requests.some((r) => r.path === '/v2/lancamentos')).toBe(false);
    expect(mutations(api)).toHaveLength(0);
  });

  test('prints candidate ids, marks the linked one, and conciliate, or a dash when there are none', async () => {
    api.on('GET /v1/integracao/account/9001/transactions', {
      inicio: '2026-10-01',
      fim: '2026-10-10',
      saldo: 0,
      lancamentos: [
        {
          integrationId: TX, descricao: 'Pagamento Ficticio', valor: -12.34, data: '2026-10-07', moeda: 1,
          _ca: { c: { d: { categoria: { v: 10 } } } },
        },
        {
          integrationId: '34343434-1111-4000-8000-000000000002',
          descricao: 'Outro Ficticio', valor: -1, data: '2026-10-08', moeda: 1,
        },
      ],
    });
    api.on('GET /v2/lancamentos', {
      list: [
        { id: 4305, dataPrevista: '2026-10-05', valor: -12.34, descricao: 'Mercado', categoria: 11 },
        { id: 4309, dataPrevista: '2026-10-09', valor: -12.34, descricao: 'Padaria', categoria: 10 },
      ],
      meta: { total: 2, page: 1, pageSize: 500 },
    });

    const result = await cli(['entries', 'import', 'list', '-a', '1001', '--since', SINCE]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Candidates');
    // Two days before (+2) comes ahead of two days after (-2) in the web's order.
    expect(result.stdout).toContain('4305 (linked), 4309');
    expect(result.stdout).toContain('conciliate');
    expect(result.stdout).toContain('needs-category');
    expect(result.stdout).not.toContain('"candidates"');
    expect(mutations(api)).toHaveLength(0);
  });

  test('a checking account stays on /v2/lancamentos even when the connection says credit card', async () => {
    api.on('GET /v1/integracao/connections', [
      { id: 501, accounts: [{ id: 9001, type: 'CARTAOCREDITO', conta: 1001 }] },
    ]);
    api.on('GET /v2/lancamentos', {
      list: [{ id: 4309, dataPrevista: '2026-10-09', valor: -12.34, descricao: 'Padaria', categoria: 10 }],
      meta: { total: 1, page: 1, pageSize: 500 },
    });

    const result = await list();

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).transactions[0].defaultAction).toBe('conciliate');
    expect(api.requests.some((r) => r.path === '/v2/lancamentos')).toBe(true);
    expect(api.requests.some((r) => r.path.includes('/fatura') || r.path.includes('primeiraFatura'))).toBe(false);
    expect(mutations(api)).toHaveLength(0);
  });
});
