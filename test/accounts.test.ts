import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CHECKING_ACCOUNT } from './fixtures.js';

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  home = createHome({
    ...MANUAL_AUTH,
    nameCache: { accounts: { byName: { nubank: 1001 }, cachedAt: new Date().toISOString() } },
  });
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

describe('accounts create', () => {
  test('resolves the type by name ignoring case and accents, and takes liquidez from the type', async () => {
    api.on('POST /v1/cadastros/contas', (req) => ({ ...CHECKING_ACCOUNT, id: 2000, ...(req.body as object) }));

    const result = await runCli(
      ['accounts', 'create', '--name', 'Reserva', '--type', 'poupanca', '--bank', '237', '--balance', '150.25'],
      { home, api }
    );

    expect(result.exitCode).toBe(0);
    const [post] = mutations(api);
    expect(post.body).toMatchObject({
      nome: 'Reserva',
      tipoNovo: 122,
      liquidez: 2,
      banco: '237',
      saldoInicial: 150.25,
      moeda: 1,
      exibirBP: true,
    });
  });

  test('accepts a numeric type ID and leaves out liquidez when the type has none', async () => {
    api.on('POST /v1/cadastros/contas', { ...CHECKING_ACCOUNT, id: 2001 });

    const result = await runCli(['accounts', 'create', '--name', 'Cartão', '--type', '102'], { home, api });

    expect(result.exitCode).toBe(0);
    const body = mutations(api)[0].body as Record<string, unknown>;
    expect(body.tipoNovo).toBe(102);
    expect(body).not.toHaveProperty('liquidez');
    expect(body).not.toHaveProperty('banco');
  });

  test('rejects an unknown type without calling the create endpoint', async () => {
    const result = await runCli(['accounts', 'create', '--name', 'X', '--type', 'bitcoin'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Unknown account type "bitcoin"');
    expect(mutations(api)).toHaveLength(0);
  });

  test('clears the account name cache so the new name resolves right away', async () => {
    api.on('POST /v1/cadastros/contas', { ...CHECKING_ACCOUNT, id: 2002 });

    await runCli(['accounts', 'create', '--name', 'Nova', '--type', '100'], { home, api });

    expect(home.readConfig().nameCache?.accounts).toBeUndefined();
  });
});

describe('accounts update', () => {
  test('round-trips the full account, unwrapping banco to its ID', async () => {
    api.on('PUT /v1/cadastros/contas/1001', { ...CHECKING_ACCOUNT, nome: 'Nubank PF' });

    const result = await runCli(['accounts', 'update', '1001', '--name', 'Nubank PF'], { home, api });

    expect(result.exitCode).toBe(0);
    const [put] = mutations(api);
    expect(put.path).toBe('/v1/cadastros/contas/1001');
    expect(put.body).toMatchObject({
      id: 1001,
      nome: 'Nubank PF',
      banco: 'nubank',
      saldoUltimoExtrato: 250.5,
      permissoes: CHECKING_ACCOUNT.permissoes,
      status: true,
    });
  });

  test('--inactive archives by setting status to false', async () => {
    api.on('PUT /v1/cadastros/contas/1001', { ...CHECKING_ACCOUNT, status: false });

    const result = await runCli(['accounts', 'update', '1001', '--inactive'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(mutations(api)[0].body).toMatchObject({ status: false, nome: 'Nubank' });
  });

  test('refuses --active together with --inactive', async () => {
    const result = await runCli(['accounts', 'update', '1001', '--active', '--inactive'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(mutations(api)).toHaveLength(0);
  });
});

describe('accounts delete', () => {
  test('deletes after confirmation', async () => {
    api.on('DELETE /v1/cadastros/contas/1001', null);

    const result = await runCli(['accounts', 'delete', '1001'], { home, api, stdin: 'y\n' });

    expect(result.exitCode).toBe(0);
    expect(mutations(api).map((r) => `${r.method} ${r.path}`)).toEqual(['DELETE /v1/cadastros/contas/1001']);
  });

  test('does nothing when the confirmation is declined', async () => {
    const result = await runCli(['accounts', 'delete', '1001'], { home, api, stdin: 'n\n' });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Deletion cancelled');
    expect(mutations(api)).toHaveLength(0);
  });
});
