import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, SESSION_RESPONSE, type SessionResponse } from './fixtures.js';
import type { EntriesResponse, Entry } from '../src/types/index.js';

// #283: the web reports (Totais por Categoria, Evolução, Comparação) send regime "ca" or "co" on
// GET /v2/lancamentos, and only offer "co" under usuario.conta.config.visaoCompetencia
// (relatoriosDatasource G, mdb.js 44178).

let api: MockApi;
let home: TestHome;

// Paid in April for work done in March: cash puts it in April, accrual in March.
const SERVICE: Entry = {
  id: 73,
  descricao: 'Serviço Teste',
  conta: 201,
  categoria: 10,
  tipo: 'd',
  valor: -80,
  data: '2026-04-05',
  dataPrevista: '2026-04-05',
  dataCompetencia: '2026-03-28',
  status: 'conciliado',
};

function session(visaoCompetencia: boolean): SessionResponse {
  const { ngInit } = SESSION_RESPONSE.payload;
  return {
    ...SESSION_RESPONSE,
    payload: { ngInit: { ...ngInit, usuario: { ...ngInit.usuario, conta: { config: { ...ngInit.usuario.conta?.config, visaoCompetencia } } } } },
  };
}

const sentRegimes = () =>
  api.requests.filter((r) => r.path === '/v2/lancamentos').map((r) => r.query.get('regime'));

const summary = (...extra: string[]) =>
  runCli(['entries', 'summary', '-a', '201', '-f', '2026-03-01', '-t', '2026-04-30', '--by', 'month', ...extra], { home, api });

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  const response: EntriesResponse = { list: [SERVICE], meta: { total: 1, page: 1, pageSize: 200 } };
  api.on('GET /v2/lancamentos', response);
  api.on('GET /v1/frontend/sessao', session(true));
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

describe('entries summary --regime', () => {
  test('accrual sends regime co and groups the month by the competence date', async () => {
    const result = await summary('--regime', 'accrual', '--json');

    expect(result.exitCode).toBe(0);
    expect(sentRegimes()).toEqual(['co']);
    const report = JSON.parse(result.stdout);
    expect(report.regime).toBe('accrual');
    expect(report.rows.map((r: { key: string; count: number }) => [r.key, r.count])).toEqual([['2026-03', 1]]);
  });

  test('cash sends regime ca and groups the month by the planned date', async () => {
    const result = await summary('--regime', 'cash', '--json');

    expect(result.exitCode).toBe(0);
    expect(sentRegimes()).toEqual(['ca']);
    const report = JSON.parse(result.stdout);
    expect(report.regime).toBe('cash');
    expect(report.rows.map((r: { key: string }) => r.key)).toEqual(['2026-04']);
  });

  test('without the flag no regime is sent and the JSON says so', async () => {
    const result = await summary('--json');

    expect(result.exitCode).toBe(0);
    expect(sentRegimes()).toEqual([null]);
    expect(JSON.parse(result.stdout).regime).toBeNull();
  });

  test('the text header names the regime and --csv keeps its columns', async () => {
    const text = await summary('--regime', 'accrual');
    const csv = await summary('--regime', 'accrual', '--csv');

    expect(text.exitCode).toBe(0);
    expect(text.stdout).toContain('Summary by month | 2026-03-01 to 2026-04-30 | accrual basis');
    expect(csv.exitCode).toBe(0);
    expect(csv.stdout).toBe('month,entries,income,expenses,net\r\n2026-03,1,0,-80,-80\r\nTotal,1,0,-80,-80\r\n');
  });

  test('accrual is refused when the account has the competence view off, as the web hides it', async () => {
    api.on('GET /v1/frontend/sessao', session(false));

    const result = await summary('--regime', 'accrual', '--json');

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('The accrual view is off for this account');
    expect(sentRegimes()).toEqual([]);
  });

  test('an unknown regime is refused before any entry is read', async () => {
    const result = await summary('--regime', 'competencia');

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Invalid --regime "competencia". Use cash or accrual.');
    expect(sentRegimes()).toEqual([]);
  });
});
