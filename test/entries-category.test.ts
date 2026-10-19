import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, EMPTY_ENTRIES_RESPONSE } from './fixtures.js';

let api: MockApi;
let home: TestHome;

// Finanças report (2026-10-16): `-c Moradia` resolved to an inactive category
// hidden in the web app. The inactive one comes last, so a plain name index
// (last name wins) points at it.
const activeMoradia = { ...CATEGORIES_RESPONSE.items[0], id: 51, nome: 'Moradia', nomeRel: 'Moradia', _ordenacao: 'MORADIA' };
const inactiveMoradia = { ...activeMoradia, id: 50, status: false };
const inactiveOnly = { ...activeMoradia, id: 52, nome: 'Aluguel antigo', nomeRel: 'Aluguel antigo', status: false };

const existing = {
  id: 70,
  descricao: 'Café',
  tipo: 'd',
  valor: -12.5,
  data: '2026-01-12',
  dataPrevista: '2026-01-12',
  status: 'conciliado',
  conciliado: true,
  conta: 1001,
  categoria: 10,
  tags: [],
};

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', {
    ...CATEGORIES_RESPONSE,
    items: [...CATEGORIES_RESPONSE.items, activeMoradia, inactiveMoradia, inactiveOnly],
  });
  api.on('GET /v2/lancamentos', EMPTY_ENTRIES_RESPONSE);
  api.on('POST /v1/lancamentos', { id: 9, descricao: 'Aluguel', valor: -10, data: '2026-01-05', status: 'conciliado' });
  api.on('GET /v1/lancamentos/70', existing);
  api.on('PUT /v1/lancamentos/70', (req) => ({ ...existing, ...(req.body as object) }));
  home = createHome({
    ...MANUAL_AUTH,
    aliases: { accounts: [], categories: [{ id: 50, name: 'casa' }], tags: [] },
  });
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

const CREATE = ['entries', 'create', '-a', '1001', '-d', 'Aluguel', '-v', '10', '-D', '2026-01-05'];

describe('entries create with an inactive category', () => {
  test('a name shared by an active and an inactive category uses the active one', async () => {
    const result = await runCli([...CREATE, '-c', 'moradia', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(mutations(api)[0].body).toMatchObject({ categoria: 51 });
  });

  test('a name that only matches an inactive category is refused before the POST', async () => {
    const result = await runCli([...CREATE, '-c', 'Aluguel antigo'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Category "Aluguel antigo" (52) is inactive');
    expect(result.output).toContain('mdcli categories list --active');
    expect(mutations(api)).toHaveLength(0);
  });

  test('an explicit inactive ID is refused even when an active category has its name', async () => {
    const result = await runCli([...CREATE, '-c', '50'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Category "Moradia" (50) is inactive');
    expect(mutations(api)).toHaveLength(0);
  });

  test('an Alias pointing at an inactive category is refused, not silently swapped', async () => {
    const result = await runCli([...CREATE, '-c', 'casa'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Category "Moradia" (50) is inactive');
    expect(mutations(api)).toHaveLength(0);
  });

  test('under --json the refusal is a JSON error on stderr', async () => {
    const result = await runCli([...CREATE, '-c', '52', '--json'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr).error).toContain('is inactive');
  });
});

describe('entries update with an inactive category', () => {
  test('refuses to move an entry to an inactive category', async () => {
    const result = await runCli(['entries', 'update', '70', '-c', '52'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('is inactive');
    expect(mutations(api)).toHaveLength(0);
  });

  test('a shared name moves the entry to the active category', async () => {
    const result = await runCli(['entries', 'update', '70', '-c', 'Moradia', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(mutations(api)[0].body).toMatchObject({ categoria: 51 });
  });
});

describe('entries list with an inactive category', () => {
  test('still filters by it, since old entries keep their category', async () => {
    const result = await runCli(['entries', 'list', '-a', '1001', '-c', '52', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    const request = api.requests.find((r) => r.path === '/v2/lancamentos');
    expect(JSON.parse(request?.query.get('categorias') ?? '')).toEqual({ ids: ['52'] });
  });
});
