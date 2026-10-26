import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';

let api: MockApi;
let home: TestHome;

const SERIES_OCCURRENCE = {
  id: 80,
  descricao: 'Psicólogo',
  tipo: 'd',
  valor: -50,
  data: '2026-10-16',
  dataPrevista: '2026-10-16',
  status: 'agendado',
  conciliado: false,
  conta: 1001,
  categoria: 10,
  parcela: 'fixa',
  agendaId: 77,
  tags: [],
};

const SINGLE_ENTRY = { ...SERIES_OCCURRENCE, id: 70, descricao: 'Café', parcela: undefined, agendaId: undefined };

// The API returns an occurrence the server no longer links to the rule (the
// first one, or one already confirmed or reconciled) with `parcela` but no
// `agendaId` (issue #70). This one is a past occurrence, already reconciled.
const DETACHED_OCCURRENCE = {
  ...SERIES_OCCURRENCE,
  id: 79,
  data: '2026-09-16',
  dataPrevista: '2026-09-16',
  status: 'conciliado',
  conciliado: true,
  agendaId: undefined,
};

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/lancamentos/80', SERIES_OCCURRENCE);
  api.on('GET /v1/lancamentos/70', SINGLE_ENTRY);
  api.on('GET /v1/lancamentos/79', DETACHED_OCCURRENCE);
  api.on('DELETE /v1/lancamentos/80', null);
  api.on('DELETE /v1/lancamentos/70', null);
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

function deletes() {
  return mutations(api).filter((r) => r.method === 'DELETE');
}

describe('entries delete --scope', () => {
  test('--scope following sends ?todos=true, like the web app', async () => {
    const result = await runCli(
      ['entries', 'delete', '80', '--scope', 'following', '--dangerously-skip-confirmation', '--json'],
      { home, api }
    );

    expect(result.exitCode).toBe(0);
    expect(deletes()).toHaveLength(1);
    expect(deletes()[0].path).toBe('/v1/lancamentos/80');
    expect(deletes()[0].query.get('todos')).toBe('true');
    expect(deletes()[0].body).toBeUndefined();
    expect(JSON.parse(result.stdout)).toEqual({ deleted: true, id: 80, scope: 'following' });
    expect(result.stderr).toBe('');
  });

  test('a series occurrence without --scope deletes only it and warns on stderr', async () => {
    const result = await runCli(['entries', 'delete', '80', '--dangerously-skip-confirmation'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(deletes()[0].query.get('todos')).toBe('false');
    expect(result.stderr).toContain('Entry 80 is an occurrence of a recurring series (fixa): only this occurrence will be deleted.');
    expect(result.stdout).toContain('Entry 80 deleted successfully!');
  });

  test('the confirmation names the scope, and answering no deletes nothing', async () => {
    const result = await runCli(['entries', 'delete', '80', '--scope', 'following'], { home, api, stdin: 'n\n' });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Scope: this and the following occurrences');
    expect(result.stdout).toContain('delete this occurrence and all the following ones?');
    expect(result.stdout).toContain('Deletion cancelled.');
    expect(deletes()).toHaveLength(0);
  });

  test('an entry outside a series is deleted without todos and refuses --scope following', async () => {
    const plain = await runCli(['entries', 'delete', '70', '--dangerously-skip-confirmation', '--json'], { home, api });
    expect(plain.exitCode).toBe(0);
    expect(deletes()[0].query.has('todos')).toBe(false);
    expect(JSON.parse(plain.stdout)).toEqual({ deleted: true, id: 70 });

    const following = await runCli(
      ['entries', 'delete', '70', '--scope', 'following', '--dangerously-skip-confirmation'],
      { home, api }
    );
    expect(following.exitCode).toBe(1);
    expect(following.stderr).toContain('Entry 70 is not part of a recurring series, so --scope following does not apply.');
    expect(deletes()).toHaveLength(1);
  });

  test('--scope following on an occurrence detached from its series explains why and deletes nothing', async () => {
    const result = await runCli(
      ['entries', 'delete', '79', '--scope', 'following', '--dangerously-skip-confirmation'],
      { home, api }
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      'Entry 79 belongs to a recurring series (fixa), but the server no longer links it to the series (like the first occurrence, or one already confirmed or reconciled), so it is deleted on its own. To delete the series, use --scope following on a scheduled occurrence.'
    );
    expect(result.stderr).not.toContain('is not part of a recurring series');
    expect(deletes()).toHaveLength(0);
  });

  test('--scope all is not offered (the web app only has this/following)', async () => {
    const result = await runCli(['entries', 'delete', '80', '--scope', 'all', '--dangerously-skip-confirmation'], { home, api });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("argument 'all' is invalid");
    expect(api.requests).toHaveLength(0);
  });
});
