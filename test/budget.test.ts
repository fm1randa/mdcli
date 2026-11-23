import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE } from './fixtures.js';
import { BUDGET_EXTRA_CATEGORIES, INVEST_ROWS, SPEND_ROWS } from './budget-fixtures.js';
import { createHome, MANUAL_AUTH, runCli, startMockApi, type MockApi, type RecordedRequest, type TestHome } from './helpers.js';

let api: MockApi;
let home: TestHome;

const plain = (value: string): string => value.replace(/\u00a0/g, ' ');

// A pinned day with literal month bounds, so the expected range does not come
// from the month arithmetic under test.
const PINNED_TODAY = { MDCLI_TODAY: '2026-11-18' };

function budgetCalls(): RecordedRequest[] {
  return api.requests.filter((request) => request.path === '/v2/lancamentos/metasorcamento');
}

function progress(amount: number, remaining: number) {
  return { amount, remaining, surplus: 0 };
}

function figures(goal: number, confirmed: [number, number], projected: [number, number]) {
  return { goal, confirmed: progress(confirmed[0], confirmed[1]), projected: progress(projected[0], projected[1]) };
}

function child(id: number, name: string | null, rowFigures: ReturnType<typeof figures>) {
  return { category: { id, name }, figures: rowFigures };
}

function line(id: number, name: string | null, rowFigures: ReturnType<typeof figures> | null, subcategories: ReturnType<typeof child>[] = []) {
  return { category: { id, name }, figures: rowFigures, subcategories };
}

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', { ...CATEGORIES_RESPONSE, items: [...CATEGORIES_RESPONSE.items, ...BUDGET_EXTRA_CATEGORIES] });
  api.on('GET /v2/lancamentos/metasorcamento', (request) => (request.query.get('investimentos') === 'true' ? INVEST_ROWS : SPEND_ROWS));
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

describe('budget', () => {
  test('reads expense and income apart from investment and recomputes the section total', async () => {
    const result = await runCli(['budget', '--month', '2026-11', '--json'], { home, api });
    expect(result.exitCode).toBe(0);
    expect(budgetCalls().map((request) => request.query.get('investimentos')).sort()).toEqual(['false', 'true']);
    for (const request of budgetCalls()) {
      expect(request.method).toBe('GET');
      expect(request.query.get('inicio')).toBe('2026-11-01');
      expect(request.query.get('fim')).toBe('2026-11-30');
      expect(request.query.get('regime')).toBe('ca');
      expect(request.query.get('tipo')).toBe('categoria');
      expect(request.query.get('indefinidas')).toBe('false');
      expect(request.query.get('apenasMetasDefinidas')).toBe('false');
      expect(request.query.get('pendentesPresente')).toBe('true');
      expect(request.query.get('moeda')).toBe('1');
    }
    expect(api.requests.every((request) => request.method === 'GET')).toBe(true);
    expect(JSON.parse(result.stdout)).toEqual({
      period: { start: '2026-11-01', end: '2026-11-30' },
      regime: 'cash',
      budgets: {
        expense: {
          general: figures(-3000, [-1200, 1800], [-1500, 1500]),
          categories: [
            line(40, 'Outros', figures(-100, [-90, 3], [-100, 4])),
            line(10, 'Alimentação', figures(-800, [-80, 1], [-200, 2]), [
              child(11, 'Mercado', figures(-200, [-50, 7], [-50, 8])),
              child(14, 'Aves', figures(-100, [-10, 6], [-10, 6])),
            ]),
            line(12, 'Zebra', null, [child(13, 'Filhote', figures(-40, [-10, 9], [-10, 9]))]),
          ],
          total: figures(-900, [-170, 730], [-300, 600]),
        },
        income: {
          general: figures(5000, [2000, 3000], [2500, 2500]),
          categories: [line(20, 'Salário', figures(4000, [2000, 5], [2200, 6]))],
          total: figures(4000, [2000, 2000], [2200, 1800]),
        },
        investment: {
          general: figures(-200, [-20, 180], [-40, 160]),
          categories: [line(77, null, figures(-50, [-10, 1], [-15, 99]))],
          total: figures(-50, [-10, 40], [-15, 35]),
        },
      },
    });
  });

  test('prints the general line, the sorted tree and the recomputed total', async () => {
    const result = await runCli(['budget', '--month', '2026-11'], { home, api });
    const stdout = plain(result.stdout);
    expect(result.exitCode).toBe(0);
    expect(stdout).toContain('Budget 2026-11-01 → 2026-11-30 (cash)');
    expect(stdout).toContain('General goal');
    expect(stdout).toContain('Expenses total');
    expect(stdout).toContain('Category 77 (not found)');
    expect(stdout).toContain('—');
    expect(stdout).toContain('-R$ 3.000,00');
    expect(stdout).toContain('R$ 730,00');
    expect(stdout).not.toContain('9.999');
    expect(stdout).not.toContain('Transferência');
    const at = (needle: string): number => {
      const index = stdout.indexOf(needle);
      expect(index).toBeGreaterThanOrEqual(0);
      return index;
    };
    expect(at('Outros')).toBeLessThan(at('Alimentação'));
    expect(at('Alimentação')).toBeLessThan(at('  Mercado'));
    expect(at('  Mercado')).toBeLessThan(at('  Aves'));
    expect(at('Zebra')).toBeLessThan(at('  Filhote'));
    expect(at('Expenses')).toBeLessThan(at('Income'));
    expect(at('Income')).toBeLessThan(at('Investments'));
  });

  test('sends accrual as co', async () => {
    const result = await runCli(['budget', '--month', '2026-11', '--regime', 'ACCRUAL', '--json'], { home, api });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).regime).toBe('accrual');
    expect(budgetCalls().every((request) => request.query.get('regime') === 'co')).toBe(true);
  });

  test('rejects a month combined with a date range before any budget request', async () => {
    const result = await runCli(['budget', '--month', '2026-11', '--from', '2026-11-01'], { home, api });
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('--month cannot be combined with --from or --to.');
    expect(budgetCalls()).toHaveLength(0);
  });

  test('rejects a month that is not YYYY-MM', async () => {
    const result = await runCli(['budget', '--month', '2026-13'], { home, api });
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('Invalid month "2026-13"');
    expect(budgetCalls()).toHaveLength(0);
  });

  test('rejects an unknown regime', async () => {
    const result = await runCli(['budget', '--regime', 'fiscal'], { home, api });
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('Invalid regime "fiscal"');
    expect(budgetCalls()).toHaveLength(0);
  });

  test('rejects a range whose start is after its end', async () => {
    const result = await runCli(['budget', '--from', '2026-12-01', '--to', '2026-11-01'], { home, api });
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('--from 2026-12-01 is after --to 2026-11-01.');
    expect(budgetCalls()).toHaveLength(0);
  });

  test('defaults to the current month in cash', async () => {
    const result = await runCli(['budget', '--json'], { home, api, extraEnv: PINNED_TODAY });
    expect(result.exitCode).toBe(0);
    expect(budgetCalls()[0]?.query.get('inicio')).toBe('2026-11-01');
    expect(budgetCalls()[0]?.query.get('fim')).toBe('2026-11-30');
    expect(budgetCalls()[0]?.query.get('regime')).toBe('ca');
  });

  test('uses the last day of February when the year is not a leap year', async () => {
    const result = await runCli(['budget', '--month', '2026-02', '--json'], { home, api });
    expect(result.exitCode).toBe(0);
    expect(budgetCalls()[0]?.query.get('inicio')).toBe('2026-02-01');
    expect(budgetCalls()[0]?.query.get('fim')).toBe('2026-02-28');
  });

  test('fills the missing bound from the current month', async () => {
    const from = await runCli(['budget', '--from', '2026-11-15', '--json'], { home, api, extraEnv: PINNED_TODAY });
    expect(from.exitCode).toBe(0);
    expect(budgetCalls().at(-1)?.query.get('inicio')).toBe('2026-11-15');
    expect(budgetCalls().at(-1)?.query.get('fim')).toBe('2026-11-30');
    const to = await runCli(['budget', '--to', '2026-11-10', '--json'], { home, api, extraEnv: PINNED_TODAY });
    expect(to.exitCode).toBe(0);
    expect(budgetCalls().at(-1)?.query.get('inicio')).toBe('2026-11-01');
    expect(budgetCalls().at(-1)?.query.get('fim')).toBe('2026-11-10');
  });
});
