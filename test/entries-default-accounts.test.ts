import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, CHECKING_ACCOUNT, CREDIT_CARD_ACCOUNT, SAMPLE_ENTRIES, cardInvoice, entriesPage } from './fixtures.js';
import type { InvoiceProjection } from './api-routes.js';

let api: MockApi;
let home: TestHome;

const PERIOD = ['--from', '2026-01-01', '--to', '2026-02-28'] as const;

const INACTIVE = { ...CHECKING_ACCOUNT, id: 205, nome: 'Inativa', status: false };
const CLOSED = { ...CHECKING_ACCOUNT, id: 206, nome: 'Encerrada', encerrada: true };
const CLOSED_CARD = { ...CREDIT_CARD_ACCOUNT, id: 207, nome: 'Cartão Encerrado', encerrada: true };

const JANUARY = ['--from', '2026-01-01', '--to', '2026-01-31'] as const;

function projection(cardId: number, description: string, value: number): InvoiceProjection {
  return {
    descricao: description,
    valor: value,
    data: '2026-01-16',
    dataPrevista: '2026-01-16',
    status: 'pendente',
    conta: 201,
    projecaoFatura: cardId,
  };
}

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

  test('drops the active card projection, keeps its purchase, and leaves a closed card out', async () => {
    api.on('GET /v1/cadastros/contas', {
      ...ACCOUNTS_RESPONSE,
      items: [...ACCOUNTS_RESPONSE.items, INACTIVE, CLOSED, CLOSED_CARD],
    });
    api.on('GET /v2/lancamentos', entriesPage([
      SAMPLE_ENTRIES[0],
      projection(202, 'Fatura Cartão Teste', -2500),
      projection(207, 'Fatura Cartão Encerrado', -80),
    ]));
    api.on('GET /v1/cartoes/202/fatura/2026-01-16', {
      ...cardInvoice('2026-01-16', '2026-01-08'),
      lancamentos: [{ id: 91, descricao: 'Mercado cartão', valor: -50, data: '2026-01-05', tipo: 'd', categoria: 11 }],
    });

    const listed = await runCli(['entries', 'list', ...JANUARY, '--json'], { home, api });

    expect(listed.exitCode).toBe(0);
    expect(accountIds(api)).toEqual([201, 202]);
    expect(JSON.parse(listed.stdout).map((entry: { id: number | string }) => entry.id)).toEqual([1, 'invoice:207', 91]);
    expect(api.requests.some((request) => request.path.includes('/cartoes/207/'))).toBe(false);

    const summary = await runCli(['entries', 'summary', ...JANUARY, '--json'], { home, api });

    expect(summary.exitCode).toBe(0);
    expect(JSON.parse(summary.stdout)).toMatchObject({
      total: { count: 2, expenses: -150.5 },
      skippedInvoices: 1,
    });
  });

  test('a 500 from the active card invoice warns, lists the other accounts, and exits 0', async () => {
    api.fail('GET /v1/cartoes/202/fatura/2026-01-16', 500, { message: 'boom' });

    const listed = await runCli(['entries', 'list', ...JANUARY], { home, api });
    expect(listed.exitCode).toBe(0);
    expect(listed.stdout).toContain('Mercado');
    expect(listed.stdout).not.toContain('Cartão Teste');
    expect(listed.stderr).toContain('Cartão Teste');
    expect(listed.stderr).toContain('2026-01-16');
    expect(listed.stderr).toContain('500');

    const summary = await runCli(['entries', 'summary', ...JANUARY, '--json'], { home, api });
    expect(summary.exitCode).toBe(0);
    expect(summary.stderr).toContain('Cartão Teste');
    expect(summary.stderr).toContain('2026-01-16');
    expect(JSON.parse(summary.stdout)).toMatchObject({
      total: { count: 5, income: 5000, expenses: -360.75 },
    });

    const named = await runCli(['entries', 'list', ...JANUARY, '-a', '201,202'], { home, api });
    expect(named.exitCode).toBe(1);
    expect(named.stderr).toContain('API request failed');
    expect(named.stdout).not.toContain('Mercado');
  });

  test('a 500 from every relevant invoice exits non-zero when nothing else remains', async () => {
    api.on('GET /v1/cadastros/contas', { ...ACCOUNTS_RESPONSE, items: [CREDIT_CARD_ACCOUNT] });
    api.on('GET /v2/lancamentos', entriesPage([]));
    api.fail('GET /v1/cartoes/202/fatura/2026-01-16', 500, { message: 'boom' });

    const listed = await runCli(['entries', 'list', ...JANUARY], { home, api });
    expect(listed.exitCode).not.toBe(0);
    expect(listed.stdout.trim()).toBe('');
    expect(listed.stderr).toContain('Cartão Teste');
    expect(listed.stderr).toContain('2026-01-16');
    expect(listed.stderr).toContain('500');

    const summary = await runCli(['entries', 'summary', ...JANUARY], { home, api });
    expect(summary.exitCode).not.toBe(0);
    expect(summary.stdout.trim()).toBe('');
    expect(summary.stderr).toContain('Cartão Teste');
  });

  test('an invalid date fails before accounts are read', async () => {
    const result = await runCli(['entries', 'list', '--from', '2026-13-01', '--to', '2026-01-31'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid --from date');
    expect(api.requests.some((request) => request.path === '/v1/cadastros/contas')).toBe(false);
  });
});
