import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome, type RecordedRequest } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, SAVINGS_ACCOUNT } from './fixtures.js';

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', { ...ACCOUNTS_RESPONSE, items: [...ACCOUNTS_RESPONSE.items, SAVINGS_ACCOUNT] });
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('POST /v1/lancamentos', (req: RecordedRequest) => req.body);
  home = createHome({ ...MANUAL_AUTH, aliases: { accounts: [], categories: [], tags: [] } });
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

function sentBody(): Record<string, unknown> {
  const [request] = mutations(api);
  if (!request) throw new Error('POST /v1/lancamentos was not called');
  return request.body as Record<string, unknown>;
}

describe('cli -v=-46.33 (short option equals value)', () => {
  test('create sends negative value -46.33 in payload', async () => {
    const result = await runCli(
      ['entries', 'create', '-a', '1001', '-d', 'Despesa', '-v=-46.33', '-c', '10', '-D', '2026-01-05', '--json'],
      { home, api }
    );
    expect(result.exitCode).toBe(0);
    const body = sentBody();
    expect(body).toMatchObject({ valor: -46.33, tipo: 'd', descricao: 'Despesa' });
  });

  test('update sends negative value -46.33 in payload', async () => {
    api.on('GET /v1/lancamentos/70', { id: 70, descricao: 'Café', valor: -12.5, conta: 1001, categoria: 10, tipo: 'd' });
    api.on('PUT /v1/lancamentos/70', (req: RecordedRequest) => ({ ...(req.body as Record<string, unknown>), id: 70 }));
    const result = await runCli(
      ['entries', 'update', '70', '-v=-46.33', '--json'],
      { home, api }
    );
    expect(result.exitCode).toBe(0);
    const [req] = mutations(api);
    expect(req).toBeDefined();
    expect(req.body).toMatchObject({ valor: -46.33 });
  });

  test('list filter with -v=-46.33 does not corrupt argv', async () => {
    const result = await runCli(
      ['entries', 'list', '-a', '1001', '-f', '2026-01-01', '-t', '2026-01-31', '-v=-46.33', '--json'],
      { home, api }
    );
    // If argv were corrupted, parseAmount would reject "=-46.33" and the
    // CLI would exit 1 with "Invalid value". The absence of that error
    // proves the preprocessor worked.
    expect(result.output).not.toContain('Invalid value');
    // The query parameter shows the value was parsed correctly, not as =-46.33.
    expect(result.output).toContain('valor=-46.33');
  });

  test('create parses uppercase short option with equals (-T=income)', async () => {
    const result = await runCli(
      ['entries', 'create', '-a', '1001', '-d', 'Salário', '-v=46.33', '-T=income', '-c', '20', '-D', '2026-01-05', '--json'],
      { home, api }
    );
    expect(result.exitCode).toBe(0);
    expect(sentBody()).toMatchObject({ valor: 46.33, tipo: 'r', descricao: 'Salário' });
  });

  test('create parses uppercase date short option with equals (-D=2026-01-05)', async () => {
    const result = await runCli(
      ['entries', 'create', '-a', '1001', '-d', 'Despesa', '-v=-46.33', '-c', '10', '-D=2026-01-05', '--json'],
      { home, api }
    );
    expect(result.exitCode).toBe(0);
    expect(sentBody()).toMatchObject({ valor: -46.33, dataPrevista: '2026-01-05' });
  });

  test('long boolean option before -v= does not hide the short option', async () => {
    const result = await runCli(
      ['entries', 'create', '-a', '1001', '-d', 'Despesa', '-c', '10', '--json', '-v=-46.33', '-D', '2026-01-05'],
      { home, api }
    );
    expect(result.exitCode).toBe(0);
    expect(sentBody()).toMatchObject({ valor: -46.33 });
  });

  test('boolean short option before -v= does not hide the short option (create -p)', async () => {
    const result = await runCli(
      ['entries', 'create', '-a', '1001', '-d', 'Despesa', '-p', '-v=-46.33', '-c', '10', '-D', '2026-01-05', '--json'],
      { home, api }
    );
    expect(result.exitCode).toBe(0);
    expect(sentBody()).toMatchObject({ valor: -46.33, status: { confirmado: false } });
  });

  test('boolean short option before -v= does not hide the short option (update -r)', async () => {
    api.on('GET /v1/lancamentos/70', { id: 70, descricao: 'Café', valor: -12.5, conta: 1001, categoria: 10, tipo: 'd' });
    api.on('PUT /v1/lancamentos/70', (req: RecordedRequest) => ({ ...(req.body as Record<string, unknown>), id: 70 }));
    const result = await runCli(
      ['entries', 'update', '70', '-r', '-v=-46.33', '--json'],
      { home, api }
    );
    expect(result.exitCode).toBe(0);
    const [req] = mutations(api);
    expect(req).toBeDefined();
    expect(req.body).toMatchObject({ valor: -46.33 });
  });
});
