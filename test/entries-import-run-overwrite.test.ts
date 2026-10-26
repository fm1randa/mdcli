import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE } from './fixtures.js';
import { CONNECTIONS, mockStatement } from './import-harness.js';

// Fictional ids. 1001 is Nubank (connection account 9001); Entry 4242 is linked to TX1 on its own.
// The web reads the overwrite preference (config "conciliacao": {o, s, sd}) from the session state
// GET /api/v1/frontend/sessao: payload.ngInit becomes window.mdconfig (session.js), and
// configuracoesService reads usuario.config.mdweb from it (mdb.js 49687-49701, 20900-20903).

const TX1 = 'aaaa1111-1111-4000-8000-000000000001';

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/integracao/connections', CONNECTIONS);
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('GET /v1/lancamentos/duplicidade', {});
  api.on('POST /v1/lancamentos/conciliacao', {});
  api.on('POST /v1/lancamentos/importar', {});
  mockStatement(api, [{ integrationId: TX1, descricao: 'Padaria Ficticia', valor: -12.34, data: '2026-10-07', moeda: 1 }]);
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

/** Entry 4242, which the web links to TX1 on its own (same value, a day apart). */
function linkedEntry(extra: Record<string, unknown> = {}) {
  const entry = { id: 4242, dataPrevista: '2026-10-08', valor: -12.34, categoria: 11, ...extra };
  api.on('GET /v2/lancamentos', { list: [entry], meta: { total: 1, page: 1, pageSize: 500 } });
}

/** The logged-in session state, with `conciliacao` in the user's web preferences when given. */
function session(conciliacao?: unknown) {
  const mdweb = conciliacao === undefined ? {} : { conciliacao };
  api.on('GET /v1/frontend/sessao', { branch: 'app', payload: { ngInit: { usuario: { config: { mdweb } } } } });
}

function run(args: string[]) {
  return runCli(['entries', 'import', 'run', '-a', '1001', '--since', '2026-10-01', '--ids', 'aaaa1111', '-c', '10', ...args], {
    home,
    api,
  });
}

function conciliationBody(): Record<string, unknown> {
  const posts = mutations(api).filter((request) => request.path === '/v1/lancamentos/conciliacao');
  expect(posts).toHaveLength(1);
  return posts[0].body as Record<string, unknown>;
}

describe('entries import run overwrite preference', () => {
  test('both on: --dry-run fills the empty description of the linked Entry, keeps its value, and writes nothing', async () => {
    session({ o: 'd', s: true, sd: true });
    linkedEntry();

    const result = await run(['--dry-run', '--json']);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    const document = JSON.parse(result.stdout);
    expect(document.overwrite).toEqual({ value: true, description: true, source: 'preferences' });
    expect(document.conciliated).toEqual([
      {
        integrationId: TX1,
        prefix: 'aaaa1111',
        entryId: 4242,
        before: { value: -12.34, description: null },
        after: { value: -12.34, description: 'Padaria Ficticia' },
      },
    ]);
    expect(mutations(api)).toHaveLength(0);
  });

  test('both on: the summary shows the description before and after, and what else the bank overwrites', async () => {
    session({ o: 'd', s: true, sd: true });
    linkedEntry();

    const result = await run(['--dry-run']);

    expect(result.exitCode).toBe(0);
    const row = result.stdout.split('\n').find((line) => line.includes('4242'));
    expect(row).toMatch(/aaaa1111.*4242.*-.*Padaria Ficticia/);
    expect(result.stdout).toContain(
      "Overwrite on (your web preference): linked entries take the bank transaction's contact, category, cost center, project, tags and document number."
    );
    expect(result.stdout).toContain(
      "Fill empty descriptions on (your web preference): a linked entry without a description takes the bank transaction's."
    );
    expect(mutations(api)).toHaveLength(0);
  });

  test('both on: an Entry that has a description keeps it, and --yes sends the preference', async () => {
    session({ o: 'd', s: true, sd: true });
    linkedEntry({ descricao: 'Padaria do bairro' });

    const result = await run(['--yes', '--json']);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    const [item] = JSON.parse(result.stdout).conciliated;
    expect(item.after).toEqual({ value: -12.34, description: 'Padaria do bairro' });
    expect(conciliationBody()).toMatchObject({ sobrescrever: true, sobrescreverDescr: true });
  });

  test('a preference saved with only sd keeps the web default for s', async () => {
    session({ sd: true });
    linkedEntry();

    const result = await run(['--yes', '--json']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).overwrite).toEqual({ value: false, description: true, source: 'preferences' });
    expect(conciliationBody()).toMatchObject({ sobrescrever: false, sobrescreverDescr: true });
  });

  test('both off: the linked Entry keeps its fields and the summary says so', async () => {
    session({ o: 'd', s: false, sd: false });
    linkedEntry();

    const result = await run(['--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      'Overwrite off (your web preference): linked entries keep their contact, category, cost center, project, tags and document number.'
    );
    expect(result.stdout).toContain('Fill empty descriptions off (your web preference): linked entries keep their description.');
  });

  test('never saved: the web default (both off) comes from the preferences', async () => {
    session();
    linkedEntry();

    const result = await run(['--yes', '--json']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).overwrite).toEqual({ value: false, description: false, source: 'preferences' });
    expect(conciliationBody()).toMatchObject({ sobrescrever: false, sobrescreverDescr: false });
  });

  test('when the session state cannot be read, the web default applies and the summary says why', async () => {
    api.on('GET /v1/frontend/sessao', { message: 'no' }, 500);
    linkedEntry();

    const result = await run(['--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      'The overwrite preferences could not be read, so the web default applies: linked entries keep their fields.'
    );
    expect(api.requests.some((request) => request.path === '/v1/frontend/sessao')).toBe(true);
  });

  test('a session state that is not the logged-in app is not read as preferences', async () => {
    api.on('GET /v1/frontend/sessao', { branch: 'signin', payload: {} });
    linkedEntry();

    const result = await run(['--dry-run', '--json']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).overwrite).toEqual({ value: false, description: false, source: 'default' });
  });
});
