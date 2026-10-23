import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE } from './fixtures.js';
import { FakeEditor } from './import-edit-harness.js';

// Fictional ids. 1001 is Nubank (connection account 9001).
// Categories: 10 Alimentação (d), 20 Salário (r), 60 Antiga (d, inactive).
const CONNECTIONS = [
  { id: 501, status: 'UPDATED', accounts: [{ id: 9001, type: 'CONTA CORRENTE', conta: 1001 }] },
];
const INACTIVE = { ...CATEGORIES_RESPONSE.items[4], id: 60, nome: 'Antiga', nomeRel: 'Antiga', status: false };
const COMMIT = [
  'POST /v1/integracao/transactions/markImported',
  'POST /v1/lancamentos/conciliacao',
  'POST /v1/lancamentos/importar',
];

const TX1 = 'aaaa1111-1111-4000-8000-000000000001';
const TX2 = 'bbbb2222-2222-4000-8000-000000000002';
const TX3 = 'cccc3333-3333-4000-8000-000000000003';
const TX4 = 'dddd4444-4444-4000-8000-000000000004';
const RULE_10 = { c: { d: { categoria: { v: 10 }, descricao: { v: 'Padaria' } } } };

let api: MockApi;
let home: TestHome;
let fake: FakeEditor;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/integracao/connections', CONNECTIONS);
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', { ...CATEGORIES_RESPONSE, items: [...CATEGORIES_RESPONSE.items, INACTIVE] });
  api.on('GET /v1/lancamentos/duplicidade', {});
  entries([]);
  api.on('POST /v1/integracao/transactions/markImported', {});
  api.on('POST /v1/lancamentos/conciliacao', {});
  api.on('POST /v1/lancamentos/importar', {});
  home = createHome(MANUAL_AUTH);
  fake = new FakeEditor();
});

afterEach(() => {
  api.stop();
  home.cleanup();
  fake.cleanup();
});

function bank(integrationId: string, extra: Record<string, unknown> = {}) {
  return { integrationId, descricao: 'Padaria Ficticia', valor: -12.34, data: '2026-10-07', moeda: 1, ...extra };
}

function statement(rows: unknown[]) {
  api.on('GET /v1/integracao/account/9001/transactions', {
    inicio: '2026-10-01',
    fim: '2026-10-10',
    saldo: 250.5,
    lancamentos: rows,
  });
}

function entries(list: unknown[]) {
  api.on('GET /v2/lancamentos', { list, meta: { total: list.length, page: 1, pageSize: 500 } });
}

function run(args: string[], editor: string, stdin?: string) {
  return runCli(['entries', 'import', 'run', '-a', '1001', '--since', '2026-10-01', '--edit', ...args], {
    home,
    api,
    stdin,
    extraEnv: { EDITOR: editor },
  });
}

function routes(): string[] {
  return mutations(api).map((request) => `${request.method} ${request.path}`);
}

function lancamentos(index: number): unknown {
  return (mutations(api)[index].body as { lancamentos: unknown }).lancamentos;
}

describe('entries import run --edit', () => {
  test('opens the suggestion, writes the edited line through the commit, and removes the file', async () => {
    statement([bank(TX1, { _ca: RULE_10 })]);
    const editor = fake.script(['import aaaa1111 2026-10-07 -12,34 Alimentação | Padaria da esquina\n']);

    const result = await run(['--yes'], editor);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(fake.seen(1)).toContain('import aaaa1111 2026-10-07 -12.34 Alimentação | Padaria\n');
    expect(routes()).toEqual(COMMIT);
    expect(lancamentos(2)).toEqual([
      expect.objectContaining({
        integrationId: TX1,
        descricao: 'Padaria da esquina',
        categoria: 10,
        valorPrevisto: -12.34,
        dataPrevista: '2026-10-07',
      }),
    ]);
    expect(existsSync(fake.editedPath())).toBe(false);
  });

  test('y at the prompt writes; --dry-run shows the plan and writes nothing', async () => {
    statement([bank(TX1, { _ca: RULE_10 })]);

    const confirmed = await run([], fake.script([null]), 'y\n');
    expect(confirmed.exitCode).toBe(0);
    expect(confirmed.stdout).toContain('(y/N)');
    expect(routes()).toEqual(COMMIT);

    api.requests.length = 0;
    fake.resetCalls();
    const dry = await run(['--dry-run', '--json'], fake.script([null]));
    expect(dry.exitCode).toBe(0);
    expect(JSON.parse(dry.stdout).imported).toEqual([
      expect.objectContaining({ integrationId: TX1, categoryId: 10, description: 'Padaria', value: -12.34 }),
    ]);
    expect(mutations(api)).toHaveLength(0);
  });

  test('opens each default action: rule, AI, needs-category, duplicate, and conciliate with the linked entry', async () => {
    statement([
      bank(TX1, { _ca: RULE_10 }),
      bank(TX2, { valor: 3000, data: '2026-10-05', descricao: 'Empresa', _ca: { ait: { r: 'tok-r' } } }),
      bank(TX3, { valor: -7, data: '2026-10-06', descricao: 'Mercado' }),
      bank(TX4, { valor: -40, data: '2026-10-08', descricao: 'Posto' }),
    ]);
    api.on('POST /v1/smartmatch/ai', [20]);
    api.on('GET /v1/lancamentos/duplicidade', { '2026-10-06': [{ id: 77, valor: -7 }] });
    entries([
      { id: 501, dataPrevista: '2026-10-08', valor: -40, descricao: 'Posto A' },
      { id: 502, dataEfetiva: '2026-10-09', valor: -40, descricao: 'Posto B' },
    ]);

    const result = await run(['--dry-run'], fake.script(['# nothing\n']));

    expect(result.exitCode).toBe(0);
    const file = fake.seen(1);
    expect(file).toContain('import aaaa1111 2026-10-07 -12.34 Alimentação | Padaria\n');
    expect(file).toContain('import bbbb2222 2026-10-05 3000.00 Salário | Empresa\n');
    expect(file).toContain('skip cccc3333 2026-10-06 -7.00  | Mercado\n');
    expect(file).toContain('# candidates dddd4444\n# 501 2026-10-08 -40.00 Posto A\n# 502 2026-10-09 -40.00 Posto B\n');
    expect(file).toContain('conciliate dddd4444 501 2026-10-08 -40.00  | Posto\n');
    expect(routes()).toEqual(['POST /v1/smartmatch/ai']);
  });

  test('an invalid line reopens the editor with the error on top, and the fixed file goes on', async () => {
    statement([bank(TX1, { _ca: RULE_10 })]);
    const editor = fake.script([
      'import aaaa1111 2026-10-08 -12.34 Alimentação | Padaria\n',
      'import aaaa1111 2026-10-07 -12.34 Alimentação | Padaria\n',
    ]);

    const result = await run(['--yes'], editor);

    expect(result.exitCode).toBe(0);
    expect(fake.calls()).toBe(2);
    expect(fake.seen(2)).toStartWith('# error: aaaa1111: the date must be the bank date 2026-10-07.\n');
    expect(fake.seen(2)).toContain('import aaaa1111 2026-10-08 -12.34 Alimentação | Padaria\n');
    expect(routes()).toEqual(COMMIT);
  });

  test('a file returned unchanged and still invalid aborts with the error, without a third call or a POST', async () => {
    statement([bank(TX1)]);
    const editor = fake.script(['import aaaa1111 2026-10-07 -12.34 Antiga | Padaria\n', null]);

    const result = await run(['--yes'], editor);

    expect(result.exitCode).toBe(1);
    expect(fake.calls()).toBe(2);
    expect(fake.seen(2)).toContain('# error: aaaa1111: Category "Antiga" (60) is inactive');
    expect(result.stderr).toContain('Category "Antiga" (60) is inactive');
    expect(mutations(api)).toHaveLength(0);
    expect(existsSync(fake.editedPath())).toBe(false);
  });

  test('a file with only comments cancels with exit 0 and no POST', async () => {
    statement([bank(TX1, { _ca: RULE_10 })]);

    const result = await run(['--yes'], fake.script(['# import aaaa1111 2026-10-07 -12.34 Alimentação | Padaria\n\n']));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Nothing to do');
    expect(mutations(api)).toHaveLength(0);
  });

  test('an editor exiting non-zero, or no $EDITOR, aborts without a POST and leaves no file', async () => {
    statement([bank(TX1, { _ca: RULE_10 })]);

    const failed = await run(['--yes'], fake.script([null], 3));
    expect(failed.exitCode).toBe(1);
    expect(failed.stderr).toContain('exited with code 3');
    expect(mutations(api)).toHaveLength(0);
    expect(existsSync(fake.editedPath())).toBe(false);

    const missing = await run(['--yes'], '');
    expect(missing.exitCode).toBe(1);
    expect(missing.stderr).toContain('$EDITOR');
    expect(mutations(api)).toHaveLength(0);
  });

  test('a far candidate from --search-to shows in the comments and links with conciliate <prefix> <entryId>', async () => {
    statement([bank(TX1)]);
    entries([{ id: 4242, dataPrevista: '2026-10-20', valor: -12.34, descricao: 'Padaria prevista', categoria: 10 }]);
    const editor = fake.script(['conciliate aaaa1111 4242 2026-10-07 -12.34  | Padaria Ficticia\n']);

    const result = await run(['--search-to', '2026-10-25', '--yes'], editor);

    expect(result.exitCode).toBe(0);
    expect(fake.seen(1)).toContain('# candidates aaaa1111\n# 4242 2026-10-20 -12.34 Padaria prevista\n');
    expect(fake.seen(1)).toContain('import aaaa1111 2026-10-07 -12.34  | Padaria Ficticia\n');
    expect(routes()).toEqual(COMMIT.slice(1));
    expect(lancamentos(0)).toEqual([expect.objectContaining({ ids: [4242], data: '2026-10-07' })]);
  });

  test('flipping the sign needs a category of the new type; explicit import lifts the duplicate skip', async () => {
    statement([bank(TX1), bank(TX2, { valor: -5, data: '2026-10-08' })]);
    api.on('GET /v1/lancamentos/duplicidade', { '2026-10-08': [{ id: 77, valor: -5 }] });
    const editor = fake.script([
      'import aaaa1111 2026-10-07 12.34 Alimentação | Estorno\nskip bbbb2222 2026-10-08 -5 | x\n',
      'import aaaa1111 2026-10-07 12.34 Salário | Estorno\nimport bbbb2222 2026-10-08 -5 Alimentação | Cafe\n',
    ]);

    const result = await run(['--yes'], editor);

    expect(result.exitCode).toBe(0);
    expect(fake.seen(2)).toContain('# error: aaaa1111: category "Alimentação" is an expense, so the value must be negative.');
    expect(result.stdout).toContain('Salário');
    expect(lancamentos(2)).toEqual([
      expect.objectContaining({ integrationId: TX1, categoria: 20, tipo: 'r', valorPrevisto: 12.34, descricao: 'Estorno' }),
      expect.objectContaining({ integrationId: TX2, categoria: 10, tipo: 'd', valorPrevisto: -5, descricao: 'Cafe' }),
    ]);
  });

  test('a different absolute value, a missing entry id, and an unknown command are refused', async () => {
    statement([bank(TX1), bank(TX2, { valor: -40, data: '2026-10-08' })]);
    // Four days away on each side: candidates, neither linked automatically.
    entries([
      { id: 501, dataPrevista: '2026-10-04', valor: -40 },
      { id: 502, dataPrevista: '2026-10-12', valor: -40 },
    ]);
    const bad = 'import aaaa1111 2026-10-07 -12.35 Alimentação | P\nconciliate bbbb2222 2026-10-08 -40  | Posto\n';
    const editor = fake.script([bad, null]);

    const result = await run(['--yes'], editor);

    expect(result.exitCode).toBe(1);
    expect(fake.seen(2)).toContain('# error: aaaa1111: value -12.35 is not the bank value -12.34. Only the sign can change.');
    expect(fake.seen(2)).toContain('# error: bbbb2222: 2 entries may match it (501, 502), none linked automatically. Write the one to link: conciliate bbbb2222 <entryId> ...');
    expect(mutations(api)).toHaveLength(0);
  });

  test('--include-duplicates opens a duplicate as import instead of skip', async () => {
    statement([bank(TX1, { _ca: RULE_10 })]);
    api.on('GET /v1/lancamentos/duplicidade', { '2026-10-07': [{ id: 77, valor: -12.34 }] });
    const editor = fake.script([null]);

    const result = await run(['--include-duplicates', '--dry-run', '--json'], editor);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(fake.seen(1)).toContain('import aaaa1111 2026-10-07 -12.34 Alimentação | Padaria\n');
    expect(JSON.parse(result.stdout).imported).toEqual([expect.objectContaining({ integrationId: TX1, categoryId: 10 })]);
    expect(mutations(api)).toHaveLength(0);
  });

  test('an untouched line with an empty bank description parses and imports', async () => {
    statement([bank(TX1, { descricao: '', _ca: { c: { d: { categoria: { v: 10 } } } } })]);
    const editor = fake.script([null]);

    const result = await run(['--dry-run', '--json'], editor);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(fake.seen(1)).toContain('import aaaa1111 2026-10-07 -12.34 Alimentação | \n');
    expect(JSON.parse(result.stdout).imported).toEqual([expect.objectContaining({ integrationId: TX1, categoryId: 10 })]);
    expect(fake.calls()).toBe(1);
  });

  test('an import line with an empty description falls back to the suggestion, then to the bank text', async () => {
    statement([bank(TX1, { _ca: RULE_10 }), bank(TX2, { valor: -7, descricao: 'Feira do banco' })]);
    const editor = fake.script([
      'import aaaa1111 2026-10-07 -12.34 Alimentação |\nimport bbbb2222 2026-10-07 -7 Alimentação | \n',
    ]);

    const result = await run(['--dry-run', '--json'], editor);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).imported).toEqual([
      expect.objectContaining({ integrationId: TX1, description: 'Padaria' }),
      expect.objectContaining({ integrationId: TX2, description: 'Feira do banco' }),
    ]);
    expect(fake.calls()).toBe(1);
  });

  test('an untouched line keeps the suggested category when another category has the same name', async () => {
    // 40 Outros (d) is the rule's suggestion; 41 Outros (r) shares the name and would win a lookup by name.
    const twin = { ...CATEGORIES_RESPONSE.items[4], id: 41, tipo: 'r' };
    api.on('GET /v1/cadastros/categorias', { ...CATEGORIES_RESPONSE, items: [...CATEGORIES_RESPONSE.items, twin] });
    statement([bank(TX1, { _ca: { c: { d: { categoria: { v: 40 } } } } })]);

    const result = await run(['--yes'], fake.script([null]));

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(fake.calls()).toBe(1);
    expect(fake.seen(1)).toContain('import aaaa1111 2026-10-07 -12.34 40 | Padaria Ficticia\n');
    expect(lancamentos(2)).toEqual([expect.objectContaining({ integrationId: TX1, categoria: 40 })]);
  });

  test('writing the suggested name back on its line keeps the suggested category', async () => {
    const twin = { ...CATEGORIES_RESPONSE.items[4], id: 41, tipo: 'r' };
    api.on('GET /v1/cadastros/categorias', { ...CATEGORIES_RESPONSE, items: [...CATEGORIES_RESPONSE.items, twin] });
    statement([bank(TX1, { _ca: { c: { d: { categoria: { v: 40 } } } } })]);

    const result = await run(['--yes'], fake.script(['import aaaa1111 2026-10-07 -12.34 outros | Padaria\n']));

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(lancamentos(2)).toEqual([expect.objectContaining({ integrationId: TX1, categoria: 40, descricao: 'Padaria' })]);
  });

  test('--reject and --category do not combine with --edit', async () => {
    statement([bank(TX1)]);

    for (const extra of [['--reject', 'aaaa1111'], ['-c', '10']]) {
      const result = await run(extra, fake.script([null]));
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('--edit');
    }
    expect(fake.calls()).toBe(0);
    expect(mutations(api)).toHaveLength(0);
  });
});
