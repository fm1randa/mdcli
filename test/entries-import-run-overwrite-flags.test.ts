import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, offContract, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE } from './fixtures.js';
import { candidate, CONNECTIONS, mockStatement, SINCE, type CandidateEntry } from './import-harness.js';

// Fictional ids. 201 is Conta Teste (connection account 301); Entry 4242 is linked to TX1 on its own.
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
  api.on('POST /v1/integracao/transactions/markImported', {});
  api.on('POST /v1/lancamentos/conciliacao', {});
  api.on('POST /v1/lancamentos/importar', {});
  mockStatement(api, [{ integrationId: TX1, descricao: 'Padaria Ficticia', valor: -12.34, data: '2026-10-07', moeda: 1 }]);
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

/**
 * Entry 4242, which the web links to TX1 on its own (same value, a day apart). Without `descricao` in
 * `extra` the Entry carries none, an answer outside Entry's type that the overwrite reads as empty.
 */
function linkedEntry(extra: Partial<CandidateEntry> = {}) {
  const entry = candidate({ id: 4242, dataPrevista: '2026-10-08', valor: -12.34, categoria: 11, descricao: '', ...extra });
  if (extra.descricao !== undefined) {
    api.on('GET /v2/lancamentos', { list: [entry], meta: { total: 1, page: 1, pageSize: 500 } });
    return;
  }
  const { descricao: _none, ...withoutDescription } = entry;
  api.on('GET /v2/lancamentos', offContract({ list: [withoutDescription], meta: { total: 1, page: 1, pageSize: 500 } }));
}

/** The logged-in session state, with `conciliacao` in the user's web preferences when given. */
function session(conciliacao?: unknown) {
  const mdweb = conciliacao === undefined ? {} : { conciliacao };
  api.on('GET /v1/frontend/sessao', { branch: 'app', payload: { ngInit: { usuario: { config: { mdweb } } } } });
}

function run(args: string[]) {
  return runCli(['entries', 'import', 'run', '-a', '201', '--since', SINCE, '--ids', 'aaaa1111', '-c', '10', ...args], {
    home,
    api,
  });
}

function conciliationBody(): Record<string, unknown> {
  const posts = mutations(api).filter((request) => request.path === '/v1/lancamentos/conciliacao');
  expect(posts).toHaveLength(1);
  return posts[0].body as Record<string, unknown>;
}

// The --overwrite/--fill-description flags override the saved preference for one toggle only, without
// writing it back (maintainer's call: follow the preference when no flag is given; never updateConfig).
describe('entries import run overwrite flags', () => {
  test('--overwrite turns sobrescrever on for this run, ignoring the saved off preference', async () => {
    session({ o: 'd', s: false, sd: false });
    linkedEntry();

    const result = await run(['--yes', '--json', '--overwrite']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).overwrite).toEqual({ value: true, description: false, valueSource: 'flag', descriptionSource: 'preferences' });
    expect(conciliationBody()).toMatchObject({ sobrescrever: true, sobrescreverDescr: false });
  });

  test('--no-overwrite turns sobrescrever off for this run, ignoring the saved on preference', async () => {
    session({ o: 'd', s: true, sd: false });
    linkedEntry();

    const result = await run(['--yes', '--json', '--no-overwrite']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).overwrite).toEqual({ value: false, description: false, valueSource: 'flag', descriptionSource: 'preferences' });
    expect(conciliationBody()).toMatchObject({ sobrescrever: false, sobrescreverDescr: false });
  });

  test('--fill-description turns sobrescreverDescr on for this run', async () => {
    session({ o: 'd', s: false, sd: false });
    linkedEntry();

    const result = await run(['--yes', '--json', '--fill-description']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).overwrite).toEqual({ value: false, description: true, valueSource: 'preferences', descriptionSource: 'flag' });
    expect(conciliationBody()).toMatchObject({ sobrescrever: false, sobrescreverDescr: true });
  });

  test('--no-fill-description turns sobrescreverDescr off for this run, ignoring the saved on preference', async () => {
    session({ o: 'd', s: false, sd: true });
    linkedEntry();

    const result = await run(['--yes', '--json', '--no-fill-description']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).overwrite).toEqual({ value: false, description: false, valueSource: 'preferences', descriptionSource: 'flag' });
    expect(conciliationBody()).toMatchObject({ sobrescrever: false, sobrescreverDescr: false });
  });

  test('--overwrite: the summary credits the flag, and the untouched description still credits the web preference', async () => {
    session({ o: 'd', s: false, sd: false });
    linkedEntry();

    const result = await run(['--dry-run', '--overwrite']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "Overwrite on: linked entries that are not reconciled take the bank transaction's contact, category, cost center, project, tags and document number."
    );
    expect(result.stdout).toContain('Fill empty descriptions off (your web preference): linked entries keep their description.');
    expect(mutations(api)).toHaveLength(0);
  });

  test('--overwrite: a reconciled entry keeps its fields, as the web', async () => {
    session({ o: 'd', s: false, sd: false });
    linkedEntry({ descricao: 'Padaria do bairro', dataPrevista: '2026-10-07', dataEfetiva: '2026-10-07', status: 'conciliado' });

    const result = await run(['--dry-run', '--json', '--overwrite']);

    expect(result.exitCode).toBe(0);
    const [item] = JSON.parse(result.stdout).conciliated;
    expect(item.after).toEqual(item.before);
    expect(mutations(api)).toHaveLength(0);
  });

  test('--fill-description: an entry that already has a description keeps it', async () => {
    session({ o: 'd', s: false, sd: false });
    linkedEntry({ descricao: 'Padaria do bairro' });

    const result = await run(['--dry-run', '--json', '--fill-description']);

    expect(result.exitCode).toBe(0);
    const [item] = JSON.parse(result.stdout).conciliated;
    expect(item.after).toMatchObject({ value: -12.34, description: 'Padaria do bairro' });
    expect(mutations(api)).toHaveLength(0);
  });
});
