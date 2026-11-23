import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, SAVINGS_ACCOUNT } from './fixtures.js';
import { serveCreate } from './entry-routes.js';

// Issue #340: `entries create` links a transfer to a savings goal the way the
// web app does. The picker of each account lists the active goals that use it
// (md.js, mdwMetaEconomiaSelect); the destination's pick goes as
// metaEconomiaDestino (a deposit), the origin's as metaEconomiaOrigem (a
// withdrawal).

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', { ...ACCOUNTS_RESPONSE, items: [...ACCOUNTS_RESPONSE.items, SAVINGS_ACCOUNT] });
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('GET /v1/metas/economia', [
    { id: 8, descricao: 'Meta Teste', status: true, contas: [{ conta: 204 }] },
    { id: 10, descricao: 'Meta Inativa Teste', status: false, contas: [{ conta: 204 }] },
    { id: 11, descricao: 'Meta Duas Contas Teste', status: true, contas: [{ conta: 201 }, { conta: 204 }] },
    { id: 12, descricao: 'Meta Outra Conta Teste', status: true, contas: [{ conta: 299 }] },
  ]);
  serveCreate(api, 9, { descricao: 'Meta', valor: -500, data: '2026-01-05', status: 'conciliado' });
  home = createHome({ ...MANUAL_AUTH, aliases: { accounts: [], categories: [], tags: [] } });
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

function transfer(from: string, to: string, ...extra: string[]): ReturnType<typeof runCli> {
  return runCli(['entries', 'create', '-a', from, '-T', 'transfer', '--to-account', to, '-d', 'Meta', '-v', '500', '-D', '2026-01-05', ...extra], { home, api });
}

describe('entries create --savings-goal (#340)', () => {
  test('a deposit into the goal account sends metaEconomiaDestino', async () => {
    const result = await transfer('201', '204', '--savings-goal', '8', '--json');

    expect(result.exitCode).toBe(0);
    const [post] = mutations(api);
    expect(post.body).toMatchObject({ contaOrigem: 201, contaDestino: 204, metaEconomiaDestino: 8 });
    expect(post.body).not.toHaveProperty('metaEconomiaOrigem');
  });

  test('a withdrawal from the goal account sends metaEconomiaOrigem', async () => {
    const result = await transfer('204', '201', '--savings-goal', '8', '--json');

    expect(result.exitCode).toBe(0);
    const [post] = mutations(api);
    expect(post.body).toMatchObject({ contaOrigem: 204, contaDestino: 201, metaEconomiaOrigem: 8 });
    expect(post.body).not.toHaveProperty('metaEconomiaDestino');
  });

  test('--dry-run prints the payload with the link and does not POST', async () => {
    const result = await transfer('201', '204', '--savings-goal', '8', '--dry-run');

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ contaOrigem: 201, contaDestino: 204, metaEconomiaDestino: 8, valor: -500 });
    expect(result.output).toContain('Dry run: nothing was written.');
    expect(mutations(api)).toHaveLength(0);
  });

  test('refuses an inactive goal', async () => {
    const result = await transfer('201', '204', '--savings-goal', '10');

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Savings goal 10 (Meta Inativa Teste) is inactive.');
    expect(mutations(api)).toHaveLength(0);
  });

  test('refuses a goal that uses neither account', async () => {
    const result = await transfer('201', '204', '--savings-goal', '12');

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Savings goal 12 (Meta Outra Conta Teste) uses neither account 201 nor account 204.');
    expect(mutations(api)).toHaveLength(0);
  });

  test('refuses a goal that uses both accounts instead of guessing the side', async () => {
    const result = await transfer('201', '204', '--savings-goal', '11');

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Savings goal 11 (Meta Duas Contas Teste) uses both accounts of the transfer');
    expect(mutations(api)).toHaveLength(0);
  });

  test('refuses a goal that does not exist', async () => {
    const result = await transfer('201', '204', '--savings-goal', '77');

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Savings goal 77 not found.');
    expect(mutations(api)).toHaveLength(0);
  });

  test('refuses --savings-goal on an expense before calling the API', async () => {
    const result = await runCli(['entries', 'create', '-a', '201', '-d', 'X', '-v', '5', '-c', '10', '--savings-goal', '8'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('--savings-goal only applies to transfers');
    expect(api.requests).toHaveLength(0);
  });

  test('refuses a --savings-goal that is not an ID before calling the API', async () => {
    const result = await transfer('201', '204', '--savings-goal', '8a');

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Invalid savings goal ID: 8a');
    expect(api.requests).toHaveLength(0);
  });
});

describe('entries create --dry-run (#340)', () => {
  test('prints an expense payload and does not POST', async () => {
    const result = await runCli(['entries', 'create', '-a', '201', '-d', 'Mercado', '-v', '12,5', '-c', '10', '-D', '2026-01-05', '--dry-run'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ descricao: 'Mercado', tipo: 'd', conta: '201', valor: -12.5, categoria: 10, metaEconomia: null });
    expect(mutations(api)).toHaveLength(0);
  });
});
