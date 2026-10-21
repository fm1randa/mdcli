import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, EMPTY_ENTRIES_RESPONSE, cardInvoice } from './fixtures.js';

// Jardinagem 2026-10-21: the status/tipoLancamento bits sent to the API and
// the ones the invoice items are filtered on locally lived in two tables.
// For every flag, the bit in the statement query and the invoice items kept
// must agree (docs/api-filters.md).
let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('GET /v2/lancamentos', EMPTY_ENTRIES_RESPONSE);
  api.on('GET /v1/cartoes/1002/fatura/2026-01-16', {
    ...cardInvoice('2026-01-16', '2026-01-08'),
    lancamentos: [
      { id: 91, descricao: 'A', valor: -1, data: '2026-01-02', status: 'pendente', tipo: 'd' },
      { id: 92, descricao: 'B', valor: -2, data: '2026-01-02', status: 'confirmado', tipo: 'd' },
      { id: 93, descricao: 'C', valor: 3, data: '2026-01-02', status: 'nconciliado', tipo: 'r' },
      { id: 94, descricao: 'D', valor: -4, data: '2026-01-02', status: 'conciliado', tipo: 't' },
      { id: 95, descricao: 'E', valor: 5, data: '2026-01-02', status: 'agendado', tipo: 't' },
      { id: 96, descricao: 'F', valor: 6, data: '2026-01-02', status: 'confirmado', tipo: 'p' },
    ],
  });
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

async function list(flags: string[]): Promise<{ ids: number[]; query: URLSearchParams | undefined }> {
  const result = await runCli(['entries', 'list', '-a', '1002', '-f', '2026-01-01', '-t', '2026-01-31', ...flags, '--json'], { home, api });
  expect(result.exitCode).toBe(0);
  const query = api.requests.find((r) => r.path === '/v2/lancamentos')?.query;
  return { ids: JSON.parse(result.stdout).map((e: { id: number }) => e.id), query };
}

describe('-s: API status bit and invoice items agree', () => {
  const cases: [string, string, number[]][] = [
    ['pending', '1', [91]],
    ['confirmed', '2', [92, 93, 96]],
    ['reconciled', '4', [94]],
    ['scheduled', '8', [95]],
  ];
  for (const [name, bit, ids] of cases) {
    test(name, async () => {
      const { ids: listed, query } = await list(['-s', name]);
      expect(query?.get('status')).toBe(bit);
      expect(listed).toEqual(ids);
    });
  }
});

describe('-T: API tipoLancamento bit and invoice items agree', () => {
  const cases: [string, string, number[]][] = [
    ['expense', '1', [91, 92]],
    ['income', '2', [93]],
    ['transfer-out', '4', [94]],
    ['transfer-in', '8', [95]],
  ];
  for (const [name, bit, ids] of cases) {
    test(name, async () => {
      const { ids: listed, query } = await list(['-T', name]);
      expect(query?.get('tipoLancamento')).toBe(bit);
      expect(listed).toEqual(ids);
    });
  }
});
