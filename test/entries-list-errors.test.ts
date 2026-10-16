import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, EMPTY_ENTRIES_RESPONSE } from './fixtures.js';

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('GET /v2/lancamentos', EMPTY_ENTRIES_RESPONSE);
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

const entriesCalls = () => api.requests.filter((r) => r.path === '/v2/lancamentos');

describe('entries list date range', () => {
  test('rejects --to past 2031-12-31 before calling the API, as JSON under --json', async () => {
    const result = await runCli(
      ['entries', 'list', '-a', '1001', '-f', '2026-11-01', '-t', '2035-12-31', '--json'],
      { home, api }
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({
      error: '--to 2035-12-31 is past 2031-12-31, the last date Meu Dinheiro loads entries for. Use --to 2031-12-31 or earlier.',
    });
    expect(entriesCalls()).toHaveLength(0);
  });

  test('without --json the same error is text on stderr', async () => {
    const result = await runCli(['entries', 'summary', '-a', '1001', '-t', '2032-01-01'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('✗ --to 2032-01-01 is past 2031-12-31');
    expect(entriesCalls()).toHaveLength(0);
  });

  test('accepts 2031-12-31 itself', async () => {
    const result = await runCli(['entries', 'list', '-a', '1001', '-f', '2031-01-01', '-t', '2031-12-31', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([]);
    expect(entriesCalls()[0].query.get('fim')).toBe('2031-12-31');
  });

  test('rejects a date that is not YYYY-MM-DD', async () => {
    const result = await runCli(['entries', 'list', '-a', '1001', '-f', '2026-13-01', '--json'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toEqual({ error: 'Invalid --from date: 2026-13-01. Use YYYY-MM-DD.' });
    expect(entriesCalls()).toHaveLength(0);
  });
});

describe('errors under --json', () => {
  test('an API error becomes a JSON error on stderr with nothing on stdout', async () => {
    api.on('GET /v2/lancamentos', { type: 2, error: 'A data limite de carregamento dos lançamentos é 31/12/2031' }, 400);

    const result = await runCli(['entries', 'list', '-a', '1001', '--json'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    const { error } = JSON.parse(result.stderr) as { error: string };
    expect(error).toStartWith('API request failed (GET /v2/lancamentos?');
    expect(error).toEndWith(': 400 Bad Request - {"type":2,"error":"A data limite de carregamento dos lançamentos é 31/12/2031"}');
  });

  test('applies to every command wrapped by action(), not just entries', async () => {
    api.on('GET /v1/cadastros/contas', { message: 'boom' }, 500);

    const json = await runCli(['accounts', 'list', '--json'], { home, api });
    expect(json.exitCode).toBe(1);
    expect(json.stdout).toBe('');
    expect(JSON.parse(json.stderr)).toEqual({
      error: 'API request failed (GET /v1/cadastros/contas?meta=true&paginate=false): 500 Internal Server Error - {"message":"boom"}',
    });

    const text = await runCli(['accounts', 'list'], { home, api });
    expect(text.exitCode).toBe(1);
    expect(text.stderr).toContain('✗ API request failed (GET /v1/cadastros/contas?meta=true&paginate=false): 500');
    expect(() => JSON.parse(text.stderr)).toThrow();
  });
});
