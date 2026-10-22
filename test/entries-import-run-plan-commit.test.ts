import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE } from './fixtures.js';

// Fictional ids. 1001 is Nubank (connection account 9001). 10 Alimentação (d), 20 Salário (r).
const CONNECTIONS = [
  { id: 501, status: 'UPDATED', accounts: [{ id: 9001, type: 'CONTA CORRENTE', conta: 1001 }] },
];
const FONTE = 'Importado via Integração bancária automática';

const TX1 = 'aaaa1111-1111-4000-8000-000000000001';
const TX2 = 'bbbb2222-2222-4000-8000-000000000002';
const TX3 = 'cccc3333-3333-4000-8000-000000000003';
const TX4 = 'dddd4444-4444-4000-8000-000000000004';

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/integracao/connections', CONNECTIONS);
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('GET /v1/lancamentos/duplicidade', {});
  api.on('GET /v2/lancamentos', { list: [], meta: { total: 0, page: 1, pageSize: 500 } });
  api.on('POST /v1/integracao/transactions/markImported', {});
  api.on('POST /v1/lancamentos/conciliacao', {});
  api.on('POST /v1/lancamentos/importar', {});
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

function bank(integrationId: string, extra: Record<string, unknown> = {}) {
  return { integrationId, descricao: 'Padaria Ficticia', valor: -12.34, data: '2026-10-07', moeda: 1, ...extra };
}

function statement(rows: unknown[]) {
  api.on('GET /v1/integracao/account/9001/transactions', {
    inicio: '2026-10-01',
    fim: '2026-10-10',
    saldo: 80,
    lancamentos: rows,
  });
}

function planFile(content: unknown): string {
  const path = join(home.dir, 'plan.json');
  writeFileSync(path, JSON.stringify(content));
  return path;
}

function cli(args: string[], stdin?: string) {
  return runCli(['entries', 'import', ...args, '-a', '1001', '--since', '2026-10-01'], { home, api, stdin });
}

function routes(): string[] {
  return mutations(api).map((request) => `${request.method} ${request.path}`);
}

describe('entries import run --plan --yes', () => {
  test('list --json, a plan built from it, and run --plan --yes --json write the three POSTs', async () => {
    statement([
      bank(TX1, { valor: 40, descricao: 'Estorno' }),
      bank(TX2, { valor: -5, data: '2026-10-08' }),
      bank(TX3, { valor: -9, data: '2026-10-09' }),
      bank(TX4, { valor: -3, data: '2026-10-10' }),
    ]);
    const listed = await cli(['list', '--json']);
    expect(listed.exitCode).toBe(0);
    const prefixes: string[] = JSON.parse(listed.stdout).transactions.map((row: { prefix: string }) => row.prefix);
    expect(prefixes).toEqual(['aaaa1111', 'bbbb2222', 'cccc3333', 'dddd4444']);

    const plan = planFile({
      transactions: [
        { id: prefixes[0], action: 'import', category: 'Alimentação', value: -40, description: 'Mercado do mês' },
        { id: prefixes[1], action: 'reject' },
        { id: prefixes[2], action: 'skip' },
        { id: TX4, action: 'import', category: 10 },
      ],
    });
    const result = await cli(['run', '--plan', plan, '--yes', '--json']);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(routes()).toEqual([
      'POST /v1/integracao/transactions/markImported',
      'POST /v1/lancamentos/conciliacao',
      'POST /v1/lancamentos/importar',
    ]);
    const [mark, conciliation, importing] = mutations(api);
    // The skipped transaction is not marked, and the page date ignores it.
    expect(mark.body).toEqual({ account: 9001, ids: [TX1, TX2, TX4], date: '2026-10-10' });
    expect(conciliation.body).toMatchObject({ lancamentos: [], maxDate: '2026-10-10', saldo: 80, fonte: FONTE });
    const imported = (importing.body as { lancamentos: Record<string, unknown>[] }).lancamentos;
    expect(imported.map((entry) => [entry.integrationId, entry.valorPrevisto, entry.descricao, entry.categoria])).toEqual([
      [TX1, -40, 'Mercado do mês', 10],
      [TX4, -3, 'Padaria Ficticia', 10],
    ]);
    const document = JSON.parse(result.stdout);
    expect(document.dryRun).toBe(false);
    expect(document.skipped).toEqual([{ integrationId: TX3, prefix: 'cccc3333', reason: 'plan' }]);
  });

  test('a plan that only skips writes nothing and asks nothing', async () => {
    statement([bank(TX1)]);

    const result = await cli(['run', '--plan', planFile({ transactions: [{ id: 'aaaa1111', action: 'skip' }] })]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('(y/N)');
    expect(result.stdout).toContain('aaaa1111 (plan)');
    expect(mutations(api)).toHaveLength(0);
  });

  test('without --yes, any answer but y cancels without a commit POST', async () => {
    statement([bank(TX1)]);
    const plan = planFile({ transactions: [{ id: 'aaaa1111', action: 'import', category: 10 }] });

    const result = await cli(['run', '--plan', plan], 'n\n');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Import cancelled. Nothing was written.');
    expect(mutations(api)).toHaveLength(0);
  });
});
