import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, CHECKING_ACCOUNT, SAMPLE_ENTRIES, cardInvoice, entriesPage } from './fixtures.js';

let api: MockApi;
let home: TestHome;

const PERIOD = ['--from', '2026-01-01', '--to', '2026-02-28'] as const;

const INACTIVE = { ...CHECKING_ACCOUNT, id: 205, nome: 'Inativa', status: false };
const CLOSED = { ...CHECKING_ACCOUNT, id: 206, nome: 'Encerrada', encerrada: true };

function accountIds(mock: MockApi): number[] {
  const listed = mock.requests.filter((request) => request.path === '/v2/lancamentos');
  const last = listed.at(-1);
  if (last === undefined) throw new Error('no lancamentos request');
  return JSON.parse(last.query.get('contas') ?? '{}').ids;
}

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', {
    ...ACCOUNTS_RESPONSE,
    items: [...ACCOUNTS_RESPONSE.items, INACTIVE, CLOSED],
  });
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('GET /v2/lancamentos', entriesPage(SAMPLE_ENTRIES));
  api.on('GET /v1/cartoes/202/fatura/2026-01-16', cardInvoice('2026-01-16', '2026-01-08'));
  api.on('GET /v1/cartoes/202/fatura/2026-02-16', cardInvoice('2026-02-16', '2026-02-08'));
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

describe('entries without --account', () => {
  test('uses every active account, and an explicit -a still selects the named one', async () => {
    const listed = await runCli(['entries', 'list', ...PERIOD, '--json'], { home, api });
    expect(listed.exitCode).toBe(0);
    expect(accountIds(api)).toEqual([201, 202]);

    const named = await runCli(['entries', 'summary', ...PERIOD, '-a', '205', '--json'], { home, api });
    expect(named.exitCode).toBe(0);
    expect(accountIds(api)).toEqual([205]);

    const blank = await runCli(['entries', 'list', ...PERIOD, '-a', ''], { home, api });
    expect(blank.exitCode).toBe(1);
    expect(blank.stderr).toContain('At least one account ID');
  });

  test('an empty active set is its own error and does not list entries', async () => {
    api.on('GET /v1/cadastros/contas', { ...ACCOUNTS_RESPONSE, items: [INACTIVE, CLOSED] });

    const result = await runCli(['entries', 'summary', ...PERIOD, '--json'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('No active account found');
    expect(api.requests.some((request) => request.path === '/v2/lancamentos')).toBe(false);
  });

  test('the pt-BR summary names category, month, and account', async () => {
    for (const [by, header, column] of [
      ['category', 'Resumo por categoria | 2026-01-01 a 2026-02-28', 'Categoria'],
      ['month', 'Resumo por mês | 2026-01-01 a 2026-02-28', 'Mês'],
      ['account', 'Resumo por conta | 2026-01-01 a 2026-02-28', 'Conta'],
    ] as const) {
      const result = await runCli(
        ['entries', 'summary', '-a', '201,202', ...PERIOD, '--by', by, '--lang', 'pt-BR'],
        { home, api },
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(header);
      const head = result.stdout.split('\n').find((line) => line.includes('Lançamentos'));
      expect(head).toContain(column);
    }
  });
});
