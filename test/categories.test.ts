import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { CATEGORIES_RESPONSE } from './fixtures.js';

const activeMoradia = { ...CATEGORIES_RESPONSE.items[4], id: 42, nome: 'Moradia', nomeRel: 'Moradia', _ordenacao: 'MORADIA' };

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

describe('categories list', () => {
  test('--type filters by category type', async () => {
    const result = await runCli(['categories', 'list', '--type', 'income', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    const names = JSON.parse(result.stdout).map((c: { name: string }) => c.name);
    expect(names).toEqual(['Salário']);
  });

  test('rejects an unknown --type', async () => {
    const result = await runCli(['categories', 'list', '--type', 'foo'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(api.requests).toHaveLength(0);
  });
});

describe('categories create', () => {
  test('a top-level category is sent with pai 0', async () => {
    api.on('POST /v1/cadastros/categorias', { id: 50, nome: 'Pets', nomeRel: 'Pets', tipo: 'd', status: true });

    const result = await runCli(['categories', 'create', '--name', 'Pets', '--type', 'expense'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(mutations(api)[0].body).toEqual({ nome: 'Pets', nomeRel: '', tipo: 'd', pai: 0 });
  });

  test('a subcategory resolves --parent by name and inherits its type', async () => {
    api.on('POST /v1/cadastros/categorias', { id: 51, nome: 'Salário/Bônus', nomeRel: 'Bônus', tipo: 'r', status: true });

    const result = await runCli(['categories', 'create', '--name', 'Bônus', '--parent', 'salário'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(mutations(api)[0].body).toEqual({ nome: 'Bônus', nomeRel: '', tipo: 'r', pai: '20' });
  });

  test('refuses a --type that contradicts the parent', async () => {
    const result = await runCli(
      ['categories', 'create', '--name', 'X', '--parent', '20', '--type', 'expense'],
      { home, api }
    );

    expect(result.exitCode).toBe(1);
    expect(mutations(api)).toHaveLength(0);
  });

  test('refuses a --parent that is inactive', async () => {
    api.on('GET /v1/cadastros/categorias', {
      ...CATEGORIES_RESPONSE,
      items: [
        ...CATEGORIES_RESPONSE.items,
        { ...CATEGORIES_RESPONSE.items[4], id: 41, nome: 'Arquivado', status: false },
      ],
    });

    const result = await runCli(
      ['categories', 'create', '--name', 'X', '--parent', 'Arquivado'],
      { home, api }
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('is inactive');
    expect(mutations(api)).toHaveLength(0);
  });

  test('requires --type or --parent', async () => {
    const result = await runCli(['categories', 'create', '--name', 'X'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(api.requests).toHaveLength(0);
  });
});

describe('categories update', () => {
  test('sends the leaf name for a subcategory, not the "Parent/Child" path', async () => {
    api.on('PUT /v1/cadastros/categorias/11', { id: 11, nome: 'Alimentação/Mercado', nomeRel: 'Mercado', status: false });

    const result = await runCli(['categories', 'update', '11', '--inactive'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(mutations(api)[0].body).toMatchObject({ id: 11, nome: 'Mercado', pai: 10, status: false });
  });

  test('a rename of a top-level category keeps pai at 0', async () => {
    api.on('PUT /v1/cadastros/categorias/10', { id: 10, nome: 'Comida', nomeRel: 'Comida', status: true });

    const result = await runCli(['categories', 'update', '10', '--name', 'Comida'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(mutations(api)[0].body).toMatchObject({ nome: 'Comida', pai: 0 });
  });

  test('refuses to edit a system category', async () => {
    const result = await runCli(['categories', 'update', '30', '--name', 'X'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('system category');
    expect(mutations(api)).toHaveLength(0);
  });
});

describe('categories delete', () => {
  test('passes the --move-to category as idDestino', async () => {
    api.on('DELETE /v1/cadastros/categorias/11', null);

    const result = await runCli(
      ['categories', 'delete', '11', '--move-to', 'Outros', '--dangerously-skip-confirmation'],
      { home, api }
    );

    expect(result.exitCode).toBe(0);
    const [del] = mutations(api);
    expect(del.path).toBe('/v1/cadastros/categorias/11');
    expect(del.query.get('idDestino')).toBe('40');
  });

  test('refuses a category that still has subcategories', async () => {
    const result = await runCli(
      ['categories', 'delete', '10', '--move-to', '40', '--dangerously-skip-confirmation'],
      { home, api }
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('has subcategories');
    expect(mutations(api)).toHaveLength(0);
  });

  test('refuses a --move-to of a different type', async () => {
    const result = await runCli(
      ['categories', 'delete', '11', '--move-to', '20', '--dangerously-skip-confirmation'],
      { home, api }
    );

    expect(result.exitCode).toBe(1);
    expect(mutations(api)).toHaveLength(0);
  });

  test('refuses a --move-to name that only matches an inactive category', async () => {
    api.on('GET /v1/cadastros/categorias', {
      ...CATEGORIES_RESPONSE,
      items: [
        ...CATEGORIES_RESPONSE.items,
        { ...CATEGORIES_RESPONSE.items[4], id: 41, nome: 'Arquivado', status: false },
      ],
    });

    const result = await runCli(
      ['categories', 'delete', '11', '--move-to', 'Arquivado', '--dangerously-skip-confirmation'],
      { home, api }
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('is inactive');
    expect(mutations(api)).toHaveLength(0);
  });

  test('refuses a --move-to explicit ID that points at an inactive category', async () => {
    api.on('GET /v1/cadastros/categorias', {
      ...CATEGORIES_RESPONSE,
      items: [
        ...CATEGORIES_RESPONSE.items,
        { ...CATEGORIES_RESPONSE.items[4], id: 41, nome: 'Arquivado', status: false },
      ],
    });

    const result = await runCli(
      ['categories', 'delete', '11', '--move-to', '41', '--dangerously-skip-confirmation'],
      { home, api }
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('is inactive');
    expect(mutations(api)).toHaveLength(0);
  });

  test('a --move-to name shared by an active and an inactive category uses the active one', async () => {
    api.on('GET /v1/cadastros/categorias', {
      ...CATEGORIES_RESPONSE,
      items: [
        ...CATEGORIES_RESPONSE.items,
        { ...CATEGORIES_RESPONSE.items[4], id: 42, nome: 'Moradia', status: true },
        { ...CATEGORIES_RESPONSE.items[4], id: 41, nome: 'Moradia', status: false },
      ],
    });
    api.on('DELETE /v1/cadastros/categorias/11', null);

    const result = await runCli(
      ['categories', 'delete', '11', '--move-to', 'moradia', '--dangerously-skip-confirmation'],
      { home, api }
    );

    expect(result.exitCode).toBe(0);
    expect(mutations(api)[0].query.get('idDestino')).toBe('42');
  });

  test('refuses a --move-to name that matches two active categories, listing their IDs', async () => {
    api.on('GET /v1/cadastros/categorias', {
      ...CATEGORIES_RESPONSE,
      items: [
        ...CATEGORIES_RESPONSE.items,
        { ...CATEGORIES_RESPONSE.items[4], id: 42, nome: 'Duplicada', status: true },
        { ...CATEGORIES_RESPONSE.items[4], id: 41, nome: 'Duplicada', status: true },
      ],
    });

    const result = await runCli(
      ['categories', 'delete', '11', '--move-to', 'duplicada', '--dangerously-skip-confirmation'],
      { home, api }
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('42');
    expect(result.output).toContain('41');
    expect(mutations(api)).toHaveLength(0);
  });
});

describe('categories with an obsolete name cache', () => {
  // The index can outlive the catalog (30-day TTL): it still points at an ID the
  // catalog no longer lists. The active category of that name is the destination.
  beforeEach(() => {
    home.cleanup();
    home = createHome({
      ...MANUAL_AUTH,
      nameCache: {
        categories: { byName: { moradia: 999 }, cachedAt: new Date().toISOString() },
      },
    });
    api.on('GET /v1/cadastros/categorias', {
      ...CATEGORIES_RESPONSE,
      items: [...CATEGORIES_RESPONSE.items, activeMoradia],
    });
  });

  test('--parent sends the active category of the name', async () => {
    api.on('POST /v1/cadastros/categorias', { id: 60, nome: 'Filha', nomeRel: 'Filha', tipo: 'd', status: true });

    const result = await runCli(['categories', 'create', '--name', 'Filha', '--parent', 'moradia'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(mutations(api)[0].body).toMatchObject({ nome: 'Filha', pai: '42' });
  });

  test('--move-to sends the active category of the name as idDestino', async () => {
    api.on('DELETE /v1/cadastros/categorias/11', null);

    const result = await runCli(
      ['categories', 'delete', '11', '--move-to', 'moradia', '--dangerously-skip-confirmation'],
      { home, api }
    );

    expect(result.exitCode).toBe(0);
    const [del] = mutations(api);
    expect(del.query.get('idDestino')).toBe('42');
  });
});
