import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, SAVINGS_ACCOUNT, TAGS_RESPONSE, entriesPage } from './fixtures.js';
import type { Entry } from '../src/types/index.js';
import { SAVINGS_GOALS } from './goals-fixtures.js';

// The GET of an entry linked to a savings goal carries metaEconomiaDestino on
// a deposit, metaEconomiaOrigem on a withdrawal and metaEconomia on an expense
// or income (#337). The web app (md.js) reads the goal of the half's own side,
// falling back to metaEconomia.

let api: MockApi;
let home: TestHome;

const transfer = {
  descricao: 'Meta Teste',
  tipo: 't',
  data: '2026-01-20',
  dataPrevista: '2026-01-20',
  status: 'conciliado',
  categoria: 30,
  tags: [],
} satisfies Partial<Entry>;

const deposit = { ...transfer, id: 81, valor: 150, valorT: -150, conta: 204, contaT: 201, transferencia: 82, metaEconomiaDestino: 7 } satisfies Entry;
const withdrawal = { ...transfer, id: 83, valor: -200, valorT: 200, conta: 204, contaT: 201, transferencia: 84, metaEconomiaOrigem: 8 } satisfies Entry;
// A withdrawal seen from its destination half, whose GET carries only the origin's goal.
const withdrawalDestination = { ...transfer, id: 84, valor: 200, valorT: -200, conta: 201, contaT: 204, transferencia: 83, metaEconomiaOrigem: 8 } satisfies Entry;
const expense = {
  id: 85, descricao: 'Despesa Meta Teste', tipo: 'd', valor: -40, data: '2026-01-21', dataPrevista: '2026-01-21',
  status: 'conciliado', conta: 204, categoria: 10, metaEconomia: 9, tags: [],
} satisfies Entry;
// The web app sends metaEconomia: 0 for an entry without a goal.
const unlinked = { ...expense, id: 86, descricao: 'Despesa Teste', metaEconomia: 0 } satisfies Entry;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', { ...ACCOUNTS_RESPONSE, items: [...ACCOUNTS_RESPONSE.items, SAVINGS_ACCOUNT] });
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('GET /v1/cadastros/tags', TAGS_RESPONSE);
  api.on('GET /v2/lancamentos', entriesPage([deposit, withdrawal, expense, unlinked]));
  // 7 Viagem Teste, 8 Reserva Teste, 9 Carro Teste (#339).
  api.on('GET /v1/metas/economia', SAVINGS_GOALS);
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

describe('entries show savings goal', () => {
  test('--json carries the goal of a deposit, a withdrawal from either half, and an expense', async () => {
    api.on('GET /v1/lancamentos/81', deposit);
    api.on('GET /v1/lancamentos/83', withdrawal);
    api.on('GET /v1/lancamentos/84', withdrawalDestination);
    api.on('GET /v1/lancamentos/85', expense);
    api.on('GET /v1/lancamentos/86', unlinked);

    const goals: unknown[] = [];
    for (const id of ['81', '83', '84', '85', '86']) {
      const result = await runCli(['entries', 'show', id, '--json'], { home, api });
      expect(result.exitCode).toBe(0);
      const shown = JSON.parse(result.stdout);
      goals.push([shown.savingsGoalId, shown.savingsGoalName]);
    }

    expect(goals).toEqual([[7, 'Viagem Teste'], [8, 'Reserva Teste'], [8, 'Reserva Teste'], [9, 'Carro Teste'], [null, null]]);
  });

  test('the text shows the goal name, and a dash without one', async () => {
    api.on('GET /v1/lancamentos/81', deposit);
    api.on('GET /v1/lancamentos/86', unlinked);

    const linked = await runCli(['entries', 'show', '81'], { home, api });
    const none = await runCli(['entries', 'show', '86'], { home, api });

    expect(linked.exitCode).toBe(0);
    expect(linked.stdout).toContain('Savings goal: Viagem Teste\n');
    expect(none.exitCode).toBe(0);
    expect(none.stdout).toMatch(/Savings goal: -\n/);
  });
});

describe('entries list savings goal', () => {
  const LIST = ['entries', 'list', '-a', '204', '-f', '2026-01-01', '-t', '2026-01-31'];

  test('--json carries savingsGoalId and savingsGoalName on every entry', async () => {
    const result = await runCli([...LIST, '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    const entries: { id: number; savingsGoalId: unknown; savingsGoalName: unknown }[] = JSON.parse(result.stdout);
    expect(entries.map((e) => [e.id, e.savingsGoalId, e.savingsGoalName])).toEqual([
      [81, 7, 'Viagem Teste'], [83, 8, 'Reserva Teste'], [85, 9, 'Carro Teste'], [86, null, null],
    ]);
  });

  test('--csv ends each row with savings_goal_id and savings_goal_name', async () => {
    const result = await runCli([...LIST, '--csv'], { home, api });

    expect(result.exitCode).toBe(0);
    const rows = result.stdout.split('\r\n').filter((row) => row !== '');
    expect(rows[0].endsWith(',document_number,savings_goal_id,savings_goal_name')).toBe(true);
    expect(rows.slice(1).map((row) => row.split(',').slice(-2))).toEqual([
      ['7', 'Viagem Teste'], ['8', 'Reserva Teste'], ['9', 'Carro Teste'], ['', ''],
    ]);
  });

  test('the table adds a goal column with the name', async () => {
    const result = await runCli(LIST, { home, api });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/│ Savings goal +│\n/);
    const goalCell = (id: number) =>
      result.stdout.split('\n').find((line) => line.startsWith(`│ ${id} `))?.split('│').at(-2)?.trim();
    expect([81, 83, 85, 86].map(goalCell)).toEqual(['Viagem Teste', 'Reserva Teste', 'Carro Teste', '-']);
  });

  test('a list without goals neither reads the goals nor adds the column', async () => {
    api.on('GET /v2/lancamentos', entriesPage([unlinked]));
    const result = await runCli(LIST, { home, api });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Despesa Teste');
    expect(result.stdout).not.toContain('Savings goal');
    expect(api.requests.filter((request) => request.path === '/v1/metas/economia')).toHaveLength(0);
  });
});
