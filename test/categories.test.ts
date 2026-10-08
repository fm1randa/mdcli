import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { CATEGORIES_RESPONSE } from './fixtures.js';

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
});
