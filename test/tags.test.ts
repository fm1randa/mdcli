import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { TAGS_RESPONSE, TAG_WORK } from './fixtures.js';

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/tags', TAGS_RESPONSE);
  home = createHome({
    ...MANUAL_AUTH,
    aliases: { accounts: [], categories: [], tags: [] },
  });
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

describe('tags list', () => {
  test('--json returns normalized tags', async () => {
    const result = await runCli(['tags', 'list', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    const tags = JSON.parse(result.stdout);
    expect(tags).toEqual([
      { id: 501, name: 'Trabalho', color: '#FF0000', active: true },
      { id: 502, name: 'Pessoal', color: '#00FF00', active: false },
    ]);
  });

  test('--active filters to active tags only', async () => {
    const result = await runCli(['tags', 'list', '--active', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    const tags = JSON.parse(result.stdout);
    expect(tags.map((t: { name: string }) => t.name)).toEqual(['Trabalho']);
  });
});

describe('tags create', () => {
  test('creates a tag with default gray color', async () => {
    api.on('POST /v1/cadastros/tags', { id: 600, nome: 'Viagem', status: true, cor: '808080' });

    const result = await runCli(['tags', 'create', '--name', 'Viagem'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(mutations(api)[0].body).toEqual({ nome: 'Viagem', cor: '808080', status: true });
  });

  test('strips leading # from --color', async () => {
    api.on('POST /v1/cadastros/tags', { id: 601, nome: 'Urgente', status: true, cor: 'FF00AA' });

    const result = await runCli(['tags', 'create', '--name', 'Urgente', '--color', '#FF00AA', '--json'], {
      home,
      api,
    });

    expect(result.exitCode).toBe(0);
    expect(mutations(api)[0].body).toEqual({ nome: 'Urgente', cor: 'FF00AA', status: true });
  });

  test('rejects an invalid color without calling the API', async () => {
    const result = await runCli(['tags', 'create', '--name', 'X', '--color', 'red'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Invalid color');
    expect(mutations(api)).toHaveLength(0);
  });
});

describe('tags alias', () => {
  test('add / list / update / rm round-trip', async () => {
    const add = await runCli(['tags', 'alias', 'add', '--id', '501', '--name', 'trab'], { home, api });
    expect(add.exitCode).toBe(0);
    expect(home.readConfig().aliases?.tags).toEqual([{ id: 501, name: 'trab' }]);

    const list = await runCli(['tags', 'alias', 'list', '--json'], { home, api });
    expect(list.exitCode).toBe(0);
    expect(JSON.parse(list.stdout)).toEqual([{ id: 501, name: 'trab' }]);

    const update = await runCli(['tags', 'alias', 'update', '--id', '501', '--name', 'work'], { home, api });
    expect(update.exitCode).toBe(0);
    expect(home.readConfig().aliases?.tags).toEqual([{ id: 501, name: 'work' }]);

    const rm = await runCli(['tags', 'alias', 'rm', '--name', 'work'], { home, api });
    expect(rm.exitCode).toBe(0);
    expect(home.readConfig().aliases?.tags).toEqual([]);
  });

  test('refuses a duplicate alias name', async () => {
    home.cleanup();
    home = createHome({
      ...MANUAL_AUTH,
      aliases: { accounts: [], categories: [], tags: [{ id: TAG_WORK.id, name: 'trab' }] },
    });

    const result = await runCli(['tags', 'alias', 'add', '--id', '502', '--name', 'trab'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('already exists');
  });
});
