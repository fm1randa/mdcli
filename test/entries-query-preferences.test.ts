import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, CHECKING_ACCOUNT, EMPTY_ENTRIES_RESPONSE, SAMPLE_ENTRIES, TAGS_RESPONSE } from './fixtures.js';

// Review of #128 (P1): every GET /v2/lancamentos of the web goes through
// relatoriosDatasource G (mdb.js 44174-44183), which sends the user's
// preferences: pendentesPresente and apenasMetasDefinidas from c.utilizacao
// (usuario.conta.config, mdb.js 49687-49689) and moeda from moedaService
// (mdb.js 17400-17402). The web loads the user from GET /frontend/sessao
// (ngInit, session.js); without it the web's defaults apply.

let api: MockApi;
let home: TestHome;

interface SessionPreferences {
  config?: Record<string, unknown>;
  mdwebMoeda?: number;
}

function session({ config, mdwebMoeda }: SessionPreferences): object {
  return {
    branch: 'app',
    payload: {
      ngInit: {
        mdUid: 42,
        usuario: {
          conta: { config },
          config: { mdweb: mdwebMoeda === undefined ? {} : { moeda: { m: mdwebMoeda } } },
        },
      },
    },
  };
}

const DOLLAR_ACCOUNT = { ...CHECKING_ACCOUNT, id: 1007, nome: 'Wise USD', moeda: 2 };

const lancamentos = (type: string) =>
  api.requests.filter((r) => r.path === '/v2/lancamentos' && r.query.get('type') === type);

/** The preference params of the only GET /v2/lancamentos of `type`; null = not sent. */
function sentPreferences(type: string): Record<string, string | null> {
  const [request] = lancamentos(type);
  return {
    pendentesPresente: request.query.get('pendentesPresente'),
    apenasMetasDefinidas: request.query.get('apenasMetasDefinidas'),
    moeda: request.query.get('moeda'),
  };
}

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', { ...ACCOUNTS_RESPONSE, items: [...ACCOUNTS_RESPONSE.items, DOLLAR_ACCOUNT] });
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('GET /v1/cadastros/tags', TAGS_RESPONSE);
  api.on('GET /v2/lancamentos', (req) => (req.query.get('type') === 'sum' ? { sum: [] } : EMPTY_ENTRIES_RESPONSE));
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

describe('GET /v2/lancamentos sends the user preferences, as the web does', () => {
  test('accounts list: pending entries in the present on, budget-only goals off', async () => {
    api.on('GET /v1/frontend/sessao', session({ config: { pendentesPresente: true, metasRD: false, moeda: 1 } }));

    const result = await runCli(['accounts', 'list', '--json', '--at', '2026-09-30'], { home, api });

    expect(result.exitCode).toBe(0);
    const [sessao] = api.requests.filter((r) => r.path === '/v1/frontend/sessao');
    expect(sessao.query.get('uid')).toBe('42');
    expect(sentPreferences('sum')).toEqual({ pendentesPresente: 'true', apenasMetasDefinidas: 'false', moeda: '1' });
  });

  test('accounts list: pending entries in the present off, budget-only goals on', async () => {
    api.on('GET /v1/frontend/sessao', session({ config: { pendentesPresente: false, metasRD: true, moeda: 1 } }));

    const result = await runCli(['accounts', 'list', '--json', '--at', '2026-09-30'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(sentPreferences('sum')).toEqual({ pendentesPresente: 'false', apenasMetasDefinidas: 'true', moeda: '1' });
  });

  test('entries list: pending entries in the present off', async () => {
    api.on('GET /v1/frontend/sessao', session({ config: { pendentesPresente: false, metasRD: false, moeda: 1 } }));

    const result = await runCli(['entries', 'list', '-a', '1001', '-f', '2026-01-01', '-t', '2026-01-31', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(sentPreferences('list')).toEqual({ pendentesPresente: 'false', apenasMetasDefinidas: 'false', moeda: '1' });
  });

  // Review of #128 round 4 (P1): the preferences are read once per run, not
  // once per page of the list.
  test('entries list over two pages reads the session and the accounts once', async () => {
    const [first, second] = SAMPLE_ENTRIES;
    api.on('GET /v2/lancamentos', (req) => {
      const { page } = JSON.parse(req.query.get('list') ?? '{}') as { page: number };
      return { list: [page === 1 ? first : second], meta: { total: 2, page, pageSize: 200 } };
    });

    const result = await runCli(['entries', 'list', '-a', '1001', '-f', '2026-01-01', '-t', '2026-02-28', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(lancamentos('list')).toHaveLength(2);
    expect((JSON.parse(result.stdout) as Array<{ id: number }>).map((e) => e.id)).toEqual([1, 2]);
    expect(api.requests.filter((r) => r.path === '/v1/frontend/sessao')).toHaveLength(1);
    // Up to the last page, only the preferences ask for the accounts; the list
    // then asks for them once more, to tell cards apart (fetchListEntries).
    const beforeLastPage = api.requests.slice(0, api.requests.indexOf(lancamentos('list')[1]));
    expect(beforeLastPage.filter((r) => r.path === '/v1/cadastros/contas')).toHaveLength(1);
    expect(api.requests.filter((r) => r.path === '/v1/cadastros/contas')).toHaveLength(2);
  });

  test('moeda is the currency picked in the web when an active account uses it', async () => {
    api.on('GET /v1/frontend/sessao', session({ config: { pendentesPresente: true, metasRD: false, moeda: 1 }, mdwebMoeda: 2 }));

    const result = await runCli(['accounts', 'list', '--json', '--at', '2026-09-30'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(sentPreferences('sum').moeda).toBe('2');
  });

  test('a picked currency no active account uses falls back to the default currency', async () => {
    api.on('GET /v1/frontend/sessao', session({ config: { pendentesPresente: true, metasRD: false, moeda: 1 }, mdwebMoeda: 5 }));

    const result = await runCli(['accounts', 'list', '--json', '--at', '2026-09-30'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(sentPreferences('sum').moeda).toBe('1');
  });

  test('preferences the account does not have are not sent, as the web leaves them undefined', async () => {
    api.on('GET /v1/frontend/sessao', session({ config: { moeda: 1 } }));

    const result = await runCli(['accounts', 'list', '--json', '--at', '2026-09-30'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(sentPreferences('sum')).toEqual({ pendentesPresente: null, apenasMetasDefinidas: null, moeda: '1' });
  });

  test('a session state that cannot be read: the list still runs, with the web defaults', async () => {
    api.on('GET /v1/frontend/sessao', { message: 'no' }, 500);

    const result = await runCli(['entries', 'list', '-a', '1001', '-f', '2026-01-01', '-t', '2026-01-31', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(sentPreferences('list')).toEqual({ pendentesPresente: null, apenasMetasDefinidas: null, moeda: '1' });
  });

  test('a session state that is not the logged-in app is not read as preferences', async () => {
    // Every preference set: only the branch check can turn them into the defaults.
    api.on('GET /v1/frontend/sessao', {
      ...session({ config: { pendentesPresente: true, metasRD: true, moeda: 1 }, mdwebMoeda: 2 }),
      branch: 'signin',
    });

    const result = await runCli(['accounts', 'list', '--json', '--at', '2026-09-30'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(sentPreferences('sum')).toEqual({ pendentesPresente: null, apenasMetasDefinidas: null, moeda: '1' });
  });
});
