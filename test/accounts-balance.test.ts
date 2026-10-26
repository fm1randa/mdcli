import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CHECKING_ACCOUNT, CREDIT_CARD_ACCOUNT, SESSION_RESPONSE } from './fixtures.js';
import { getCurrentMonthRange } from '../src/lib/dates.js';

// Issue #67: accounts list showed saldoUltimoExtrato (Reserva de Emergência:
// 4491.97 from a 2023-09-07 statement) while the web showed R$ 0,00. The web's
// account balance panels (Saldos de caixa / Saldos das contas, mdb.js) ask the
// server for GET /v2/lancamentos type=sum, finalidade 1, fim = the reference
// day, grouped by account, and show confirmado and projetado.

let api: MockApi;
let home: TestHome;

// The real Reserva de Emergência (#67): its last statement is from 2023.
const EMERGENCY_FUND = {
  ...CHECKING_ACCOUNT,
  id: 862776,
  nome: 'Reserva de Emergência',
  tipo: 'OUTROS',
  tipoNovo: 103,
  banco: undefined,
  saldoUltimoExtrato: 4491.97,
  dataUltimoExtrato: '2023-09-07',
};

/** The cells of the table row whose Name is `name`. */
function row(stdout: string, name: string): string[] {
  const line = stdout.split('\n').find((l) => l.includes(` ${name} `)) ?? '';
  return line.replace(/\u00a0/g, ' ').split('│').map((cell) => cell.trim()).slice(1, -1);
}

const sumRequests = () => api.requests.filter((r) => r.path === '/v2/lancamentos' && r.query.get('type') === 'sum');

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  // Mercado Pago on 2026-10-26: 622.52 confirmed, 577.52 with a pending -45.
  api.on('GET /v2/lancamentos', { sum: [{ conta: 1001, projetado: 577.52, confirmado: 622.52 }] });
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

describe('accounts list balances', () => {
  test('--json reports the web balance at --at, with the bank statement only as extra', async () => {
    const result = await runCli(['accounts', 'list', '--json', '--at', '2026-10-16'], { home, api });

    expect(result.exitCode).toBe(0);
    const [sum] = sumRequests();
    expect(sum.query.get('finalidade')).toBe('1');
    expect(sum.query.get('fim')).toBe('2026-10-16');
    expect(sum.query.has('inicio')).toBe(false);
    expect(JSON.parse(sum.query.get('sum') ?? '')).toEqual({ groupBy: 'conta' });
    // The card has no web balance, so it is not asked for.
    expect(JSON.parse(sum.query.get('contas') ?? '').ids).toEqual([1001]);

    const accounts = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
    expect(accounts.find((a) => a.id === 1001)).toMatchObject({
      name: 'Nubank',
      balance: 622.52,
      projectedBalance: 577.52,
      balanceDate: '2026-10-16',
      bankBalance: 250.5,
      bankBalanceDate: '2026-01-10',
    });
  });

  test('without --at the balances are at the last day of the current month, as in the web', async () => {
    api.on('GET /v1/cadastros/contas', { ...ACCOUNTS_RESPONSE, items: [EMERGENCY_FUND] });
    api.on('GET /v2/lancamentos', { sum: [{ conta: 862776, projetado: 0, confirmado: 0 }] });

    const result = await runCli(['accounts', 'list'], { home, api });

    expect(result.exitCode).toBe(0);
    const { endDate } = getCurrentMonthRange();
    expect(sumRequests()[0].query.get('fim')).toBe(endDate);
    expect(result.stdout).toContain(`balances at ${endDate}`);
    expect(row(result.stdout, 'Reserva de Emergência')).toEqual([
      '862776',
      'Reserva de Emergência',
      'OUTROS',
      '-',
      'R$ 0,00',
      'R$ 0,00',
      'R$ 4.491,97 (2023-09-07)',
      'Active',
    ]);
  });

  test('a card has no balance, and with only cards no sum is asked for', async () => {
    api.on('GET /v1/cadastros/contas', { ...ACCOUNTS_RESPONSE, items: [{ ...CREDIT_CARD_ACCOUNT, saldoUltimoExtrato: 16099 }] });

    const result = await runCli(['accounts', 'list', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(sumRequests()).toHaveLength(0);
    const [card] = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
    expect(card).toMatchObject({ id: 1002, balance: null, projectedBalance: null });
  });

  test('an account the server leaves out of the sum shows no balance instead of the statement', async () => {
    const result = await runCli(['accounts', 'list', '--at', '2026-10-16'], { home, api });

    expect(result.exitCode).toBe(0);
    const card = row(result.stdout, 'Cartão Azul');
    expect(card.slice(4, 6)).toEqual(['-', '-']);
    expect(row(result.stdout, 'Nubank').slice(4, 7)).toEqual(['R$ 622,52', 'R$ 577,52', 'R$ 250,50 (2026-01-10)']);
  });

  // Review of #128 round 2: the web asks a balance only of the accounts in the
  // currency moedaService picked (carregarContasPR, mdb.js 4392-4399).
  test('only the accounts in the currency picked in the web get a balance', async () => {
    const dollar = { ...CHECKING_ACCOUNT, id: 1007, nome: 'Wise USD', moeda: 2 };
    api.on('GET /v1/cadastros/contas', { ...ACCOUNTS_RESPONSE, items: [...ACCOUNTS_RESPONSE.items, dollar] });
    const usuario = SESSION_RESPONSE.payload.ngInit.usuario;
    api.on('GET /v1/frontend/sessao', {
      ...SESSION_RESPONSE,
      payload: { ngInit: { ...SESSION_RESPONSE.payload.ngInit, usuario: { ...usuario, config: { mdweb: { moeda: { m: 2 } } } } } },
    });
    api.on('GET /v2/lancamentos', { sum: [{ conta: 1007, projetado: 80, confirmado: 100 }] });

    const result = await runCli(['accounts', 'list', '--json', '--at', '2026-10-16'], { home, api });

    expect(result.exitCode).toBe(0);
    const [sum] = sumRequests();
    expect(sum.query.get('moeda')).toBe('2');
    expect(JSON.parse(sum.query.get('contas') ?? '').ids).toEqual([1007]);
    expect(api.requests.filter((r) => r.path === '/v1/frontend/sessao')).toHaveLength(1);
    const accounts = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
    expect(accounts.find((a) => a.id === 1001)).toMatchObject({ balance: null, projectedBalance: null, bankBalance: 250.5 });
    expect(accounts.find((a) => a.id === 1007)).toMatchObject({ balance: 100, projectedBalance: 80 });
  });

  test('when every account is in the picked currency, all of them are asked for', async () => {
    const savings = { ...CHECKING_ACCOUNT, id: 1008, nome: 'Poupança' };
    api.on('GET /v1/cadastros/contas', { ...ACCOUNTS_RESPONSE, items: [...ACCOUNTS_RESPONSE.items, savings] });

    const result = await runCli(['accounts', 'list', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    const [sum] = sumRequests();
    expect(sum.query.get('moeda')).toBe('1');
    expect(JSON.parse(sum.query.get('contas') ?? '').ids).toEqual([1001, 1008]);
  });

  test('refuses an invalid --at before calling the API', async () => {
    const result = await runCli(['accounts', 'list', '--at', '2026-02-31'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid date "2026-02-31"');
    expect(api.requests).toHaveLength(0);
  });
});
