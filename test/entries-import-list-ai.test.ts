import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE } from './fixtures.js';
import { CONNECTIONS, mockStatement, SINCE } from './import-harness.js';

// Fictional ids. 1001 is Nubank. 9001 is its connection account, not the Account id.
// Statement 2026-10-01..2026-10-10, so the search window is 2026-09-29..2026-10-12.

const RULE = 'a1a1a1a1-1111-4000-8000-000000000001';
const MARKET = 'b2b2b2b2-1111-4000-8000-000000000002';
const UNKNOWN = 'c3c3c3c3-1111-4000-8000-000000000003';
const ONE_MATCH = 'd4d4d4d4-1111-4000-8000-000000000004';
const FAR_MATCH = 'e5e5e5e5-1111-4000-8000-000000000005';
const NO_TOKEN = 'f6f6f6f6-1111-4000-8000-000000000006';
const SALARY = '17171717-1111-4000-8000-000000000007';
const TRANSFER = '28282828-1111-4000-8000-000000000008';

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/integracao/connections', CONNECTIONS);
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('GET /v1/lancamentos/duplicidade', {});
  api.on('GET /v2/lancamentos', { list: [], meta: { total: 0, page: 1, pageSize: 500 } });
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

function statement(rows: unknown[]) {
  mockStatement(api, rows);
}

function bank(integrationId: string, valor: number, descricao: string, ca: Record<string, unknown>, data = '2026-10-07') {
  return { integrationId, descricao, valor, data, moeda: 1, _ca: ca };
}

function entries(list: unknown[]) {
  api.on('GET /v2/lancamentos', { list, meta: { total: list.length, page: 1, pageSize: 500 } });
}

function list(json = true) {
  return runCli(
    ['entries', 'import', 'list', '-a', '1001', '--since', SINCE, ...(json ? ['--json'] : [])],
    { home, api },
  );
}

function aiPosts() {
  return api.requests.filter((r) => r.method === 'POST' && r.path === '/v1/smartmatch/ai');
}

interface Row {
  integrationId: string;
  suggestedCategory: { id: number; name: string | null; source: string } | null;
  defaultAction: string;
}

function rows(stdout: string): Map<string, Row> {
  const body = JSON.parse(stdout) as { transactions: Row[] };
  return new Map(body.transactions.map((row) => [row.integrationId, row]));
}

describe('entries import list AI category', () => {
  test('asks the AI only for rows without a rule category and without an automatically linked entry', async () => {
    statement([
      bank(RULE, -5, 'Padaria Regra', { c: { d: { categoria: { v: 11 } } }, ait: { d: ['d', 'padaria regra'] } }),
      bank(MARKET, -20, 'Mercado Sem Regra', { ait: { d: ['d', 'mercado sem regra'], r: ['r', 'nao usar'] } }),
      bank(UNKNOWN, -30, 'Loja Desconhecida', { ait: { d: ['d', 'loja desconhecida'] } }),
      bank(ONE_MATCH, -40, 'Boleto Casado', { ait: { d: ['d', 'boleto casado'] } }),
      bank(FAR_MATCH, -50, 'Boleto Longe', { ait: { d: ['d', 'boleto longe'] } }),
      bank(NO_TOKEN, -60, 'Sem Token', {}),
      bank(SALARY, 900, 'Credito Empresa', { ait: { d: ['d', 'nao usar'], r: ['r', 'credito empresa'] } }),
    ]);
    entries([
      { id: 7001, dataPrevista: '2026-10-08', valor: -40 },
      // Four days off: a candidate, but not linked automatically.
      { id: 7002, dataPrevista: '2026-10-03', valor: -50 },
    ]);
    api.on('POST /v1/smartmatch/ai', [11, null, 10, 20]);

    const result = await list();

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(aiPosts().map((r) => r.body)).toEqual([
      { t: [['d', 'mercado sem regra'], ['d', 'loja desconhecida'], ['d', 'boleto longe'], ['r', 'credito empresa']] },
    ]);
    const body = JSON.parse(result.stdout);
    expect(body.ai).toBe('ok');
    const byId = rows(result.stdout);
    expect(byId.get(RULE)?.suggestedCategory).toEqual({ id: 11, name: 'Alimentação/Mercado', source: 'rule' });
    expect(byId.get(MARKET)?.suggestedCategory).toEqual({ id: 11, name: 'Alimentação/Mercado', source: 'ai' });
    expect(byId.get(MARKET)?.defaultAction).toBe('import');
    expect(byId.get(UNKNOWN)?.suggestedCategory).toBeNull();
    expect(byId.get(UNKNOWN)?.defaultAction).toBe('needs-category');
    expect(byId.get(ONE_MATCH)?.suggestedCategory).toBeNull();
    expect(byId.get(ONE_MATCH)?.defaultAction).toBe('conciliate');
    expect(byId.get(FAR_MATCH)?.suggestedCategory).toEqual({ id: 10, name: 'Alimentação', source: 'ai' });
    expect(byId.get(FAR_MATCH)?.defaultAction).toBe('import');
    expect(byId.get(NO_TOKEN)?.suggestedCategory).toBeNull();
    expect(byId.get(SALARY)?.suggestedCategory).toEqual({ id: 20, name: 'Salário', source: 'ai' });
    expect(mutations(api).map((r) => `${r.method} ${r.path}`)).toEqual(['POST /v1/smartmatch/ai']);
    expect(api.requests.some((r) => /preferencias|usuarios|config/.test(r.path))).toBe(false);
  });

  for (const status of [500, 401, 403]) {
    test(`a ${status} answer marks the AI unavailable and the list still comes out with the rule category`, async () => {
      statement([
        bank(RULE, -5, 'Padaria Regra', { c: { d: { categoria: { v: 11 } } }, ait: { d: ['d', 'padaria regra'] } }),
        bank(UNKNOWN, -30, 'Loja Desconhecida', { ait: { d: ['d', 'loja desconhecida'] } }),
      ]);
      api.on('POST /v1/smartmatch/ai', { message: 'plano' }, status);

      const result = await list();

      expect(result.exitCode).toBe(0);
      const body = JSON.parse(result.stdout);
      expect(body.ai).toBe('unavailable');
      const byId = rows(result.stdout);
      expect(byId.get(RULE)?.suggestedCategory).toEqual({ id: 11, name: 'Alimentação/Mercado', source: 'rule' });
      expect(byId.get(RULE)?.defaultAction).toBe('import');
      expect(byId.get(UNKNOWN)?.suggestedCategory).toBeNull();
      expect(byId.get(UNKNOWN)?.defaultAction).toBe('needs-category');
      expect(aiPosts().length).toBeGreaterThanOrEqual(1);
      expect(mutations(api).every((r) => r.path === '/v1/smartmatch/ai')).toBe(true);
    });
  }

  test('an answer that is not an array marks the AI unavailable', async () => {
    statement([bank(UNKNOWN, -30, 'Loja Desconhecida', { ait: { d: ['d', 'loja desconhecida'] } })]);
    api.on('POST /v1/smartmatch/ai', { categoria: 10 });

    const result = await list();

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).ai).toBe('unavailable');
    expect(rows(result.stdout).get(UNKNOWN)?.suggestedCategory).toBeNull();
  });

  test('is unused and sends nothing when every row has a rule category or an automatically linked entry', async () => {
    statement([
      bank(RULE, -5, 'Padaria Regra', { c: { d: { categoria: { v: 11 } } }, ait: { d: ['d', 'padaria regra'] } }),
      bank(ONE_MATCH, -40, 'Boleto Casado', { ait: { d: ['d', 'boleto casado'] } }),
    ]);
    entries([{ id: 7001, dataPrevista: '2026-10-08', valor: -40 }]);

    const result = await list();

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout).ai).toBe('unused');
    expect(mutations(api)).toHaveLength(0);
  });

  test('a transfer sends the t token and may get a transfer category', async () => {
    statement([
      bank(TRANSFER, -100, 'Pix Para Mim', { st: true, ait: { d: ['d', 'pix para mim'], t: ['t', 'pix para mim'] } }),
    ]);
    api.on('POST /v1/smartmatch/ai', [30]);

    const result = await list();

    expect(result.exitCode).toBe(0);
    expect(aiPosts().map((r) => r.body)).toEqual([{ t: [['t', 'pix para mim']] }]);
    expect(rows(result.stdout).get(TRANSFER)?.suggestedCategory).toEqual({ id: 30, name: 'Transferência', source: 'ai' });
    expect(mutations(api)).toHaveLength(1);
  });

  test('a category id written as a string, in _ca and in the AI answer, becomes the suggested category', async () => {
    statement([
      bank(RULE, -5, 'Padaria Regra', { c: { d: { categoria: { v: '11' } } }, ait: { d: ['d', 'padaria regra'] } }),
      bank(MARKET, -20, 'Mercado Sem Regra', { ait: { d: ['d', 'mercado sem regra'] } }),
      bank(SALARY, 900, 'Credito Empresa', { ait: { r: ['r', 'credito empresa'] } }),
    ]);
    api.on('POST /v1/smartmatch/ai', ['10', '20']);

    const result = await list();

    expect(result.exitCode).toBe(0);
    expect(aiPosts().map((r) => r.body)).toEqual([{ t: [['d', 'mercado sem regra'], ['r', 'credito empresa']] }]);
    const byId = rows(result.stdout);
    expect(byId.get(RULE)?.suggestedCategory).toEqual({ id: 11, name: 'Alimentação/Mercado', source: 'rule' });
    expect(byId.get(RULE)?.defaultAction).toBe('import');
    expect(byId.get(MARKET)?.suggestedCategory).toEqual({ id: 10, name: 'Alimentação', source: 'ai' });
    expect(byId.get(MARKET)?.defaultAction).toBe('import');
    expect(byId.get(SALARY)?.suggestedCategory).toEqual({ id: 20, name: 'Salário', source: 'ai' });
  });

  test('an AI id that is not a plain positive integer string is ignored', async () => {
    statement([
      bank(MARKET, -20, 'Mercado Sem Regra', { ait: { d: ['d', 'mercado sem regra'] } }),
      bank(UNKNOWN, -30, 'Loja Desconhecida', { ait: { d: ['d', 'loja desconhecida'] } }),
      bank(FAR_MATCH, -50, 'Boleto Longe', { ait: { d: ['d', 'boleto longe'] } }),
    ]);
    api.on('POST /v1/smartmatch/ai', ['1e1', '', '0x0a']);

    const result = await list();

    expect(result.exitCode).toBe(0);
    const byId = rows(result.stdout);
    expect(byId.get(MARKET)?.suggestedCategory).toBeNull();
    expect(byId.get(UNKNOWN)?.suggestedCategory).toBeNull();
    expect(byId.get(FAR_MATCH)?.suggestedCategory).toBeNull();
    expect(byId.get(MARKET)?.defaultAction).toBe('needs-category');
  });

  test('an AI category the row cannot take leaves it without a category, as in the web app', async () => {
    const OTHER_DEBIT = '39393939-1111-4000-8000-000000000009';
    const INACTIVE = '4a4a4a4a-1111-4000-8000-00000000000a';
    statement([
      bank(MARKET, -20, 'Mercado Sem Regra', { ait: { d: ['d', 'mercado sem regra'] } }),
      bank(SALARY, 900, 'Credito Empresa', { ait: { r: ['r', 'credito empresa'] } }),
      bank(TRANSFER, -100, 'Pix Para Mim', { st: true, ait: { t: ['t', 'pix para mim'] } }),
      bank(UNKNOWN, -30, 'Loja Desconhecida', { ait: { d: ['d', 'loja desconhecida'] } }),
      bank(INACTIVE, -35, 'Loja Antiga', { ait: { d: ['d', 'loja antiga'] } }),
      bank(OTHER_DEBIT, -45, 'Loja Certa', { ait: { d: ['d', 'loja certa'] } }),
    ]);
    api.on('GET /v1/cadastros/categorias', {
      ...CATEGORIES_RESPONSE,
      items: [
        ...CATEGORIES_RESPONSE.items,
        { ...CATEGORIES_RESPONSE.items[4], id: 41, nome: 'Antiga', nomeRel: 'Antiga', status: false },
      ],
    });
    // Salary (r) on a debit, groceries (d) on a credit, groceries (d) on a transfer,
    // an id the catalog does not have, an inactive category, and one that fits.
    api.on('POST /v1/smartmatch/ai', [20, 11, 11, 999, 41, '40']);

    const result = await list();

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout).ai).toBe('ok');
    const byId = rows(result.stdout);
    for (const id of [MARKET, SALARY, TRANSFER, UNKNOWN, INACTIVE]) {
      expect(byId.get(id)?.suggestedCategory).toBeNull();
      expect(byId.get(id)?.defaultAction).toBe('needs-category');
    }
    expect(byId.get(OTHER_DEBIT)?.suggestedCategory).toEqual({ id: 40, name: 'Outros', source: 'ai' });
    expect(byId.get(OTHER_DEBIT)?.defaultAction).toBe('import');
    expect(mutations(api).map((r) => `${r.method} ${r.path}`)).toEqual(['POST /v1/smartmatch/ai']);
  });

  test('the table shows the AI category and says when the AI was unavailable', async () => {
    statement([
      bank(MARKET, -20, 'Mercado Sem Regra', { ait: { d: ['d', 'mercado sem regra'] } }),
    ]);
    api.on('POST /v1/smartmatch/ai', [11]);

    const ok = await list(false);

    expect(ok.exitCode).toBe(0);
    expect(ok.stdout).toContain('Alimentação/Mercado (AI)');
    expect(ok.stdout).not.toContain('unavailable');

    api.on('POST /v1/smartmatch/ai', { message: 'plano' }, 500);
    const down = await list(false);

    expect(down.exitCode).toBe(0);
    expect(down.stdout).toContain('Mercado Sem Regra');
    expect(down.stdout).toContain('AI category suggestions are unavailable');
    expect(down.stdout).not.toContain('(AI)');
  });
});
