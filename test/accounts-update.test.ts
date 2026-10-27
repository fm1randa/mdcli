import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  createHome,
  MANUAL_AUTH,
  mutations,
  runCli,
  startMockApi,
  type MockApi,
  type TestHome,
} from './helpers.js';
import { ACCOUNTS_RESPONSE, CHECKING_ACCOUNT, CREDIT_CARD_ACCOUNT } from './fixtures.js';

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

/** Serves CHECKING_ACCOUNT (1001) with these fields changed. */
function withChecking(changes: Record<string, unknown>): void {
  api.on('GET /v1/cadastros/contas', { ...ACCOUNTS_RESPONSE, items: [{ ...CHECKING_ACCOUNT, ...changes }] });
}

async function update(...args: string[]) {
  api.on('PUT /v1/cadastros/contas/1001', (req) => ({ ...CHECKING_ACCOUNT, ...(req.body as object), banco: undefined }));
  const result = await runCli(['accounts', 'update', '1001', ...args], { home, api });
  return { result, body: mutations(api)[0]?.body as Record<string, unknown> | undefined };
}

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
    const body = mutations(api)[0].body;
    expect(body).toMatchObject({ status: false, nome: 'Nubank' });
    expect(body).not.toHaveProperty('encerrada');
  });

  test('keeps the stored balance date and sends banco 0 for an account without a bank, like the web', async () => {
    withChecking({ banco: undefined });

    const { result, body } = await update('--name', 'Carteira');

    expect(result.exitCode).toBe(0);
    expect(body).toMatchObject({ banco: 0, dataSaldoInicial: '2025-01-01', encerrada: false });
  });

  test('--balance-date changes the initial balance day', async () => {
    const { result, body } = await update('--balance-date', '2026-03-15');

    expect(result.exitCode).toBe(0);
    expect(body?.dataSaldoInicial).toBe('2026-03-15');
  });

  test('--debtor alone flips the stored balance to negative', async () => {
    withChecking({ saldoInicial: 82.09 });

    const { result, body } = await update('--debtor');

    expect(result.exitCode).toBe(0);
    expect(body?.saldoInicial).toBe(-82.09);
  });

  test('--balance keeps the stored sign, as the web pre-sets Credor/Devedor from it', async () => {
    withChecking({ saldoInicial: -30 });

    const { result, body } = await update('--balance', '10');

    expect(result.exitCode).toBe(0);
    expect(body?.saldoInicial).toBe(-10);
  });

  test('--creditor with --balance turns a negative account positive', async () => {
    withChecking({ saldoInicial: -30 });

    const { body } = await update('--balance', '10', '--creditor');

    expect(body?.saldoInicial).toBe(10);
  });

  test('--type takes the new type liquidez and keeps the current one when the type has none', async () => {
    withChecking({ liquidez: 0 });

    const toSavings = await update('--type', 'Poupança');
    expect(toSavings.body?.liquidez).toBe(2);

    api.requests.length = 0;
    const toCard = await update('--type', '102');
    expect(toCard.body).toMatchObject({ tipoNovo: 102, liquidez: 0 });
  });

  test('--liquidity changes liquidez and is refused when the new type has a grupobp', async () => {
    const fixed = await update('--liquidity', '0');
    expect(fixed.body?.liquidez).toBe(0);

    api.requests.length = 0;
    const card = await update('--type', '102', '--liquidity', 'fixed');
    expect(card.result.exitCode).toBe(1);
    expect(card.body).toBeUndefined();
  });

  test('--hide-net-worth and --show-net-worth set exibirBP', async () => {
    const hide = await update('--hide-net-worth');
    expect(hide.body?.exibirBP).toBe(false);

    withChecking({ exibirBP: false });
    api.requests.length = 0;
    const show = await update('--show-net-worth');
    expect(show.body?.exibirBP).toBe(true);
  });

  test('refuses --hide-net-worth with --show-net-worth', async () => {
    const { result, body } = await update('--hide-net-worth', '--show-net-worth');

    expect(result.exitCode).toBe(1);
    expect(body).toBeUndefined();
  });

  test('--inactive --close closes the account', async () => {
    const { result, body } = await update('--inactive', '--close');

    expect(result.exitCode).toBe(0);
    expect(body).toMatchObject({ status: false, encerrada: true });
  });

  test('--active reopens a closed account and leaves encerrada out, like the web status dialog', async () => {
    withChecking({ status: false, encerrada: true });

    const { result, body } = await update('--active');

    expect(result.exitCode).toBe(0);
    expect(body?.status).toBe(true);
    expect(body).not.toHaveProperty('encerrada');
  });

  test('--inactive on an already closed account keeps it closed, as no status change happens', async () => {
    withChecking({ status: false, encerrada: true });

    const { result, body } = await update('--inactive', '--name', 'X');

    expect(result.exitCode).toBe(0);
    expect(body).toMatchObject({ nome: 'X', status: false, encerrada: true });
  });

  test('--active on an already active account keeps the stored encerrada', async () => {
    const { result, body } = await update('--active');

    expect(result.exitCode).toBe(0);
    expect(body).toMatchObject({ status: true, encerrada: false });
  });

  test('a status-only update passes banco through as stored instead of sending 0, like the web status dialog', async () => {
    withChecking({ banco: undefined });

    const { result, body } = await update('--inactive');

    expect(result.exitCode).toBe(0);
    expect(body?.status).toBe(false);
    expect(body).not.toHaveProperty('banco');
  });

  test('never sends banco 0 for a credit card, as the web card form does not', async () => {
    api.on('PUT /v1/cadastros/contas/1002', (req) => ({ ...CREDIT_CARD_ACCOUNT, ...(req.body as object) }));

    const result = await runCli(['accounts', 'update', '1002', '--name', 'Cartão Verde'], { home, api });

    expect(result.exitCode).toBe(0);
    const body = mutations(api)[0].body;
    expect(body).toMatchObject({ id: 1002, nome: 'Cartão Verde' });
    expect(body).not.toHaveProperty('banco');
  });

  test('refuses invalid form flags before fetching the accounts', async () => {
    for (const args of [
      ['--debtor', '--creditor'],
      ['--balance', 'abc'],
      ['--balance-date', '2026-02-30'],
      ['--liquidity', 'liquid'],
    ]) {
      api.requests.length = 0;
      const { result } = await update(...args);
      expect(result.exitCode).toBe(1);
      expect(api.requests).toHaveLength(0);
    }
  });

  test('refuses --debtor on an account whose balance is zero', async () => {
    withChecking({ saldoInicial: 0 });

    const { result, body } = await update('--debtor');

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('--debtor has no effect on a zero balance');
    expect(body).toBeUndefined();
  });

  test('refuses --close without --inactive', async () => {
    const { result, body } = await update('--close');

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('--close only works together with --inactive');
    expect(body).toBeUndefined();
  });

  test('refuses --active together with --inactive', async () => {
    const result = await runCli(['accounts', 'update', '1001', '--active', '--inactive'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(mutations(api)).toHaveLength(0);
  });
});
