import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, SAVINGS_ACCOUNT } from './fixtures.js';
import { GOALS_TODAY, goalBalanceAt, goalMovements, SAVINGS_GOALS } from './goals-fixtures.js';

// #339: goals list and goals show read GET /v1/metas/economia and a goal's
// /lancamentos and /saldo. "Today" is pinned so the compound-interest figure
// is a literal: Viagem Teste (7) has 12 contribution months left, Reserva
// Teste (8) has none, Carro Teste (9) is inactive.

let api: MockApi;
let home: TestHome;

const plain = (value: string): string => value.replace(/\u00a0/g, ' ');

/** The CLI with today pinned, its stdout with the currency's no-break space made plain. */
async function cli(args: string[]) {
  const result = await runCli(args, { home, api, extraEnv: { MDCLI_TODAY: GOALS_TODAY } });
  return { ...result, stdout: plain(result.stdout) };
}

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', { ...ACCOUNTS_RESPONSE, items: [...ACCOUNTS_RESPONSE.items, SAVINGS_ACCOUNT] });
  api.on('GET /v1/metas/economia', SAVINGS_GOALS);
  for (const id of [7, 8]) {
    api.on(`GET /v1/metas/economia/${id}/lancamentos`, (request) =>
      goalMovements(id, request.query.get('inicio') ?? '', request.query.get('fim') ?? ''));
    api.on(`GET /v1/metas/economia/${id}/saldo`, (request) => goalBalanceAt(id, request.query.get('data') ?? ''));
  }
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

describe('goals list', () => {
  test('--json lists the active goals by description with remaining, percent and the ideal contribution', async () => {
    const result = await cli(['goals', 'list', '--json']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      {
        id: 8,
        description: 'Reserva Teste',
        active: true,
        target: 5000,
        deadline: '2026-06-01',
        monthlyRate: 0,
        balance: 4200,
        remaining: 800,
        percent: 84,
        idealMonthlyContribution: 800,
        webIdealMonthlyContribution: 5000,
        accounts: [{ accountId: 204, balance: 4200 }],
      },
      {
        id: 7,
        description: 'Viagem Teste',
        active: true,
        target: 12000,
        deadline: '2027-12-01',
        monthlyRate: 0.005,
        balance: 3000,
        remaining: 9000,
        percent: 25,
        idealMonthlyContribution: 709.76,
        webIdealMonthlyContribution: 709.76,
        accounts: [{ accountId: 204, balance: 2500 }, { accountId: 201, balance: 500 }],
      },
    ]);
  });

  test('the table shows what is missing, not the whole target, for a goal with no month left', async () => {
    const result = await cli(['goals', 'list']);

    expect(result.exitCode).toBe(0);
    const reserva = result.stdout.split('\n').find((line) => line.includes('Reserva Teste'));
    expect(reserva?.split('│').map((part) => part.trim())).toEqual([
      '', '8', 'Reserva Teste', 'R$ 5.000,00', '2026-06-01', 'R$ 4.200,00', 'R$ 800,00', '84.00%', 'R$ 800,00', '',
    ]);
    expect(result.stdout).toContain('R$ 709,76');
    expect(result.stdout).not.toContain('Carro Teste');
  });

  test('--all adds the inactive goal with a status column', async () => {
    const result = await cli(['goals', 'list', '--all']);

    expect(result.exitCode).toBe(0);
    const carro = result.stdout.split('\n').find((line) => line.includes('Carro Teste'));
    expect(carro?.split('│').map((part) => part.trim())).toEqual([
      '', '9', 'Carro Teste', 'R$ 30.000,00', '2028-06-01', 'R$ 0,00', 'R$ 30.000,00', '0.00%', 'R$ 991,91', 'inactive', '',
    ]);
  });
});

describe('goals show', () => {
  test('shows the summary, the web figure apart, the accounts and the current year statement', async () => {
    const result = await cli(['goals', 'show', '8']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Ideal monthly contribution: R$ 800,00\n');
    expect(result.stdout).toContain('Web ideal monthly contribution: R$ 5.000,00\n');
    expect(result.stdout).toContain('Remaining: R$ 800,00\n');
    expect(result.stdout).toMatch(/│ Poupança Teste +│ R\$ 4\.200,00 │/);
    expect(result.stdout).toContain('Statement 2026-01-01 → 2026-12-31');
    expect(result.stdout).toMatch(/│ 2025-12-31 +│ Previous balance +│.*│ R\$ 1\.950,00 │/);
    expect(result.stdout).toMatch(/│ 2026-05-10 +│ Aporte Meta Teste +│ Poupança Teste +│ Reconciled +│ R\$ 2\.250,00 +│ R\$ 4\.200,00 │/);
    const statement = api.requests.find((request) => request.path === '/v1/metas/economia/8/lancamentos');
    expect(statement?.query.toString()).toBe('inicio=2026-01-01&fim=2026-12-31');
    const balance = api.requests.find((request) => request.path === '/v1/metas/economia/8/saldo');
    expect(balance?.query.toString()).toBe('data=2025-12-31');
  });

  test('--month --json carries the opening balance and the running balance of each entry', async () => {
    const result = await cli(['goals', 'show', '7', '--month', '2026-06', '--json']);

    expect(result.exitCode).toBe(0);
    const shown = JSON.parse(result.stdout);
    expect(shown.goal.idealMonthlyContribution).toBe(709.76);
    expect(shown.period).toEqual({ start: '2026-06-01', end: '2026-06-30' });
    expect(shown.opening).toEqual({ kind: 'previous', date: '2026-05-31', balance: 1500 });
    expect(shown.entries.map((entry: { id: number; value: number; balance: number }) => [entry.id, entry.value, entry.balance]))
      .toEqual([[63, 1000, 2500]]);
    expect(shown.closingBalance).toBe(2500);
  });

  test('labels the opening row as the initial balance in the year the goal starts', async () => {
    const initial = await cli(['goals', 'show', '7', '--month', '2026-02', '--json']);
    const before = await cli(['goals', 'show', '7', '--month', '2026-01', '--json']);

    expect(initial.exitCode).toBe(0);
    expect(JSON.parse(initial.stdout).opening).toEqual({ kind: 'initial', date: '2026-01-10', balance: 1000 });
    expect(before.exitCode).toBe(0);
    expect(JSON.parse(before.stdout).opening).toEqual({ kind: 'previous', date: '2025-12-31', balance: 0 });
  });

  test('refuses an unknown goal and a month combined with a range', async () => {
    const unknown = await cli(['goals', 'show', '99']);
    const conflict = await cli(['goals', 'show', '7', '--month', '2026-06', '--from', '2026-06-01']);

    expect(unknown.exitCode).toBe(1);
    expect(unknown.stderr).toContain('Savings goal 99 not found.');
    expect(conflict.exitCode).toBe(1);
    expect(conflict.stderr).toContain('--month cannot be combined with --from or --to.');
  });
});
