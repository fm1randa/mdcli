import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, SAMPLE_ENTRIES, entriesPage } from './fixtures.js';

let api: MockApi;
let home: TestHome;

const PERIOD = ['-a', '1001,1002', '--from', '2026-01-01', '--to', '2026-02-28'];

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('GET /v2/lancamentos', entriesPage(SAMPLE_ENTRIES));
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

describe('entries list pagination', () => {
  test('fetches every page instead of stopping at the first 200 entries', async () => {
    const all = Array.from({ length: 450 }, (_, i) => ({ ...SAMPLE_ENTRIES[0], id: i + 1 }));
    api.on('GET /v2/lancamentos', (req) => {
      const { page, pageSize } = JSON.parse(req.query.get('list') ?? '{}');
      return entriesPage(all.slice((page - 1) * pageSize, page * pageSize), all.length);
    });

    const result = await runCli(['entries', 'list', ...PERIOD, '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toHaveLength(450);
    const pages = api.requests
      .filter((r) => r.path === '/v2/lancamentos')
      .map((r) => JSON.parse(r.query.get('list') ?? '{}').page);
    expect(pages).toEqual([1, 2, 3]);
  });

  test('keeps paging past a short page while meta.total says more remain', async () => {
    const all = Array.from({ length: 5 }, (_, i) => ({ ...SAMPLE_ENTRIES[0], id: i + 1 }));
    api.on('GET /v2/lancamentos', (req) => {
      const { page } = JSON.parse(req.query.get('list') ?? '{}');
      // The server caps pageSize below the requested 200.
      const list = all.slice((page - 1) * 2, page * 2);
      return { list, meta: { total: all.length, page, pageSize: 2 } };
    });

    const result = await runCli(['entries', 'list', ...PERIOD, '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toHaveLength(5);
    const pages = api.requests
      .filter((r) => r.path === '/v2/lancamentos')
      .map((r) => JSON.parse(r.query.get('list') ?? '{}').page);
    expect(pages).toEqual([1, 2, 3]);
  });
});

describe('entries list --csv', () => {
  test('writes RFC 4180 CSV with account and category names', async () => {
    const result = await runCli(['entries', 'list', ...PERIOD, '--csv'], { home, api });

    expect(result.exitCode).toBe(0);
    const lines = result.stdout.split('\r\n');
    expect(lines[0]).toBe('id,date,description,value,type,status,account,category,installment');
    expect(lines[1]).toBe('1,2026-01-05,Mercado,-100.5,expense,reconciled,Nubank,Alimentação/Mercado,');
    expect(lines).toContain('6,2026-02-01,"Café, ""especial""",-10,expense,reconciled,Nubank,,');
    expect(lines).toContain('4,2026-01-20,Restaurante,-200,expense,reconciled,Cartão Azul,Alimentação,');
  });

  test('refuses --json together with --csv', async () => {
    const result = await runCli(['entries', 'list', ...PERIOD, '--json', '--csv'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('either --json or --csv');
  });
});

describe('entries summary', () => {
  async function summary(...extra: string[]) {
    const result = await runCli(['entries', 'summary', ...PERIOD, '--json', ...extra], { home, api });
    expect(result.exitCode).toBe(0);
    return JSON.parse(result.stdout);
  }

  test('groups by category, biggest spending first, leaving transfers out', async () => {
    const report = await summary();

    expect(report.rows.map((r: { label: string; net: number }) => [r.label, r.net])).toEqual([
      ['Alimentação', -200],
      ['Alimentação/Mercado', -150.75],
      ['(no category)', -10],
      ['Salário', 5000],
    ]);
    expect(report.total).toMatchObject({ count: 5, income: 5000, expenses: -360.75, net: 4639.25 });
    expect(report.skippedTransfers).toBe(1);
  });

  test('--by month lists months in order', async () => {
    const report = await summary('--by', 'month');

    expect(report.rows).toEqual([
      { key: '2026-01', label: '2026-01', count: 3, income: 5000, expenses: -300.5, net: 4699.5 },
      { key: '2026-02', label: '2026-02', count: 2, income: 0, expenses: -60.25, net: -60.25 },
    ]);
  });

  test('--by account labels rows with account names', async () => {
    const report = await summary('--by', 'account');

    expect(report.rows.map((r: { label: string }) => r.label)).toEqual(['Cartão Azul', 'Nubank']);
  });

  test('--include-transfers counts them', async () => {
    const report = await summary('--include-transfers');

    expect(report.skippedTransfers).toBe(0);
    expect(report.total).toMatchObject({ count: 6, expenses: -1360.75 });
  });

  test('--csv ends with a total row', async () => {
    const result = await runCli(['entries', 'summary', ...PERIOD, '--by', 'month', '--csv'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      'month,entries,income,expenses,net\r\n' +
        '2026-01,3,5000,-300.5,4699.5\r\n' +
        '2026-02,2,0,-60.25,-60.25\r\n' +
        'Total,5,5000,-360.75,4639.25\r\n'
    );
  });

  test('the table view reports the transfers it left out', async () => {
    const result = await runCli(['entries', 'summary', ...PERIOD], { home, api });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Summary by category | 2026-01-01 to 2026-02-28');
    expect(result.stdout).toContain('1 transfer(s) left out');
  });

  test('the table shows a negative net with its minus sign', async () => {
    const result = await runCli(['entries', 'summary', ...PERIOD, '--by', 'month'], { home, api });

    expect(result.exitCode).toBe(0);
    const stdout = result.stdout.replace(/\u00a0/g, ' ');
    expect(stdout).toContain('-R$ 60,25');
    expect(stdout).toContain('R$ 4.699,50');
  });

  test('rejects an unknown --by', async () => {
    const result = await runCli(['entries', 'summary', ...PERIOD, '--by', 'week'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Invalid --by "week"');
  });
});

describe('--exclude-category', () => {
  test('leaves out a category together with its subcategories', async () => {
    const result = await runCli(
      ['entries', 'summary', ...PERIOD, '--exclude-category', 'alimentação', '--json'],
      { home, api }
    );

    expect(result.exitCode).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.rows.map((r: { label: string }) => r.label)).toEqual(['(no category)', 'Salário']);
    expect(report.excludedByCategory).toBe(3);
    expect(report.total).toMatchObject({ count: 2, income: 5000, expenses: -10 });
  });

  test('excluding a subcategory keeps its parent', async () => {
    const result = await runCli(
      ['entries', 'list', ...PERIOD, '--exclude-category', 'Alimentação/Mercado', '--json'],
      { home, api }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).map((e: { id: number }) => e.id)).toEqual([3, 4, 5, 6]);
  });

  test('accepts several categories and IDs', async () => {
    const result = await runCli(['entries', 'list', ...PERIOD, '-x', '11,Salário', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).map((e: { id: number }) => e.id)).toEqual([4, 5, 6]);
  });

  test('rejects an unknown category before fetching entries', async () => {
    const result = await runCli(['entries', 'summary', ...PERIOD, '-x', 'Viagens'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Unknown category(ies) in --exclude-category: Viagens');
    expect(api.requests.some((r) => r.path === '/v2/lancamentos')).toBe(false);
  });

  test('the table says how many entries were excluded', async () => {
    const result = await runCli(['entries', 'summary', ...PERIOD, '-x', 'Alimentação'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('3 entries left out by --exclude-category.');
  });
});
