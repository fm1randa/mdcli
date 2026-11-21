import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, offContract, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE } from './fixtures.js';
import { CONNECTIONS, mockStatement, SINCE, type BankTransaction } from './import-harness.js';

// Fictional ids. 201 is Conta Teste. 301 is its connection account, not the Account id.

const RULE_TEXT_ID = 'aaaaaaaa-1111-4000-8000-0000000000a1';
const FALLBACK_TEXT_ID = 'bbbbbbbb-1111-4000-8000-0000000000b1';
const BANK_TEXT_ID = 'cccccccc-1111-4000-8000-0000000000c1';
const TAG_ONE = '11111111-1111-4000-8000-000000000001';
const TAG_MANY = '22222222-2222-4000-8000-000000000002';
const TAG_TRANSFER = '33333333-3333-4000-8000-000000000003';
const TAG_NONE = '44444444-4444-4000-8000-000000000004';
const TAG_MIXED = '55555555-5555-4000-8000-000000000005';

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

function cli(args: string[]) {
  return runCli(args, { home, api });
}

function statement(rows: BankTransaction[]) {
  mockStatement(api, rows, { inicio: '2026-09-01', fim: '2026-10-31', saldo: 10 });
}

describe('entries import list suggestions: descriptions and ids', () => {
  test('suggests descricao from the learned field, then _ca.d, and never the bank text', async () => {
    api.on('GET /v1/integracao/account/301/transactions', offContract({
      inicio: '2026-09-01',
      fim: '2026-10-31',
      saldo: 10,
      lancamentos: [
        {
          integrationId: RULE_TEXT_ID,
          descricao: 'Texto do Banco',
          valor: -3,
          data: '2026-10-11',
          _ca: {
            d: 'Fallback D',
            c: {
              d: { descricao: { v: 'Descricao da Regra' } },
              r: { descricao: { v: 'Descricao de Receita' } },
            },
          },
        },
        {
          integrationId: FALLBACK_TEXT_ID,
          descricao: 'Outro Texto do Banco',
          valor: -4,
          data: '2026-10-12',
          _ca: {
            d: 'Somente Ca D',
            c: { r: { descricao: { v: 'Nao Essa' } } },
          },
        },
        {
          integrationId: BANK_TEXT_ID,
          descricao: 'Fica no Banco',
          valor: -5,
          data: '2026-10-13',
          _ca: { d: 12, c: { d: { descricao: { v: 99 } } } },
        },
      ],
    }));

    const result = await cli(['entries', 'import', 'list', '-a', '201', '--since', SINCE, '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const rows = JSON.parse(result.stdout).transactions;
    expect(rows.map((row: { description: string | null; bankDescription: string | null; suggestedDescription: string | null }) => ({
      description: row.description,
      bankDescription: row.bankDescription,
      suggestedDescription: row.suggestedDescription,
    }))).toEqual([
      { description: 'Descricao da Regra', bankDescription: 'Texto do Banco', suggestedDescription: 'Descricao da Regra' },
      { description: 'Somente Ca D', bankDescription: 'Outro Texto do Banco', suggestedDescription: 'Somente Ca D' },
      { description: 'Fica no Banco', bankDescription: 'Fica no Banco', suggestedDescription: null },
    ]);
    expect(mutations(api)).toHaveLength(0);
  });

  test('reads suggested ids as numbers or decimal-integer strings, one or a list', async () => {
    statement([
      {
        integrationId: TAG_ONE,
        descricao: 'Uma Tag',
        valor: -2,
        data: '2026-10-14',
        _ca: { c: { d: { tags: { v: 501 } } } },
      },
      {
        integrationId: TAG_MANY,
        descricao: 'Duas Tags',
        valor: -3,
        data: '2026-10-15',
        _ca: { c: { d: { tags: { v: [501, 502] } } } },
      },
      {
        integrationId: TAG_TRANSFER,
        descricao: 'Tag de Transferencia',
        valor: -6,
        data: '2026-10-16',
        _ca: {
          st: true,
          c: {
            d: { tags: { v: 501 } },
            t: { tags: { v: [502] } },
          },
        },
      },
      {
        integrationId: TAG_NONE,
        descricao: 'Sem Campo',
        valor: -7,
        data: '2026-10-17',
        _ca: { c: { d: { categoria: { v: '11' } } } },
      },
      {
        integrationId: TAG_MIXED,
        descricao: 'Tags Misturadas',
        valor: 9,
        data: '2026-10-18',
        _ca: { c: { r: { tags: { v: [501, '502', 1.5] }, categoria: { v: '20' } } } },
      },
    ]);

    const result = await cli(['entries', 'import', 'list', '-a', '201', '--since', SINCE, '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const rows = JSON.parse(result.stdout).transactions;
    expect(rows.map((row: { suggestedTagIds: number[]; suggestedCategory: { id: number } | null }) => ({
      suggestedTagIds: row.suggestedTagIds,
      categoryId: row.suggestedCategory?.id ?? null,
    }))).toEqual([
      { suggestedTagIds: [501], categoryId: null },
      { suggestedTagIds: [501, 502], categoryId: null },
      { suggestedTagIds: [502], categoryId: null },
      { suggestedTagIds: [], categoryId: 11 },
      { suggestedTagIds: [501, 502], categoryId: 20 },
    ]);
    expect(mutations(api)).toHaveLength(0);
  });
});
