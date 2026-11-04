import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { addAlias, getAliases, removeAlias, resolveId, resolveIds, updateAlias } from '../src/lib/aliases.js';

const configDir = process.env.MDCLI_CONFIG_DIR!;

function writeConfig(config: object): void {
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, 'mdcli.config.json'), JSON.stringify(config, null, 2));
}

beforeEach(() => {
  writeConfig({
    aliases: {
      accounts: [{ id: 201, name: 'principal' }],
      categories: [],
      tags: [],
    },
  });
});

afterEach(() => {
  rmSync(join(configDir, 'mdcli.config.json'), { force: true });
});

describe('getAliases / addAlias / updateAlias / removeAlias', () => {
  test('lists aliases for a type', () => {
    expect(getAliases('accounts')).toEqual([{ id: 201, name: 'principal' }]);
    expect(getAliases('tags')).toEqual([]);
  });

  test('addAlias stores a new mapping', () => {
    expect(addAlias('tags', 501, 'trab')).toEqual({ success: true });
    expect(getAliases('tags')).toEqual([{ id: 501, name: 'trab' }]);
  });

  test('addAlias refuses a duplicate name or id', () => {
    expect(addAlias('accounts', 202, 'principal')).toEqual({
      success: false,
      error: 'O alias "principal" já existe',
    });
    expect(addAlias('accounts', 201, 'other')).toEqual({
      success: false,
      error: 'O ID 201 já tem o alias "principal"',
    });
  });

  test('updateAlias renames an existing alias', () => {
    expect(updateAlias('accounts', 201, 'conta')).toEqual({ success: true });
    expect(getAliases('accounts')).toEqual([{ id: 201, name: 'conta' }]);
  });

  test('updateAlias fails when the id is missing or the name conflicts', () => {
    expect(updateAlias('accounts', 999, 'x')).toEqual({
      success: false,
      error: 'Nenhum alias encontrado para o ID 999',
    });
    addAlias('accounts', 202, 'outro');
    expect(updateAlias('accounts', 201, 'outro')).toEqual({
      success: false,
      error: 'O alias "outro" já existe',
    });
  });

  test('removeAlias accepts an id or a name', () => {
    expect(removeAlias('accounts', '201')).toEqual({ success: true });
    expect(getAliases('accounts')).toEqual([]);

    addAlias('accounts', 201, 'principal');
    expect(removeAlias('accounts', 'principal')).toEqual({ success: true });
    expect(removeAlias('accounts', 'missing')).toEqual({
      success: false,
      error: 'Nenhum alias encontrado para "missing"',
    });
  });
});

describe('resolveId / resolveIds (offline paths)', () => {
  // These paths return before name-cache (and api.ts) load, so this file stays
  // safe to run before api-refresh.test.ts in CI's alphabetical order.
  test('numeric identifiers win without looking up aliases', async () => {
    expect(await resolveId('accounts', '202')).toBe(202);
  });

  test('aliases resolve offline', async () => {
    expect(await resolveId('accounts', 'principal')).toBe(201);
  });

  test('resolveIds splits a comma list of ids and aliases', async () => {
    expect(await resolveIds('accounts', '201, principal, 203')).toEqual({
      ids: [201, 201, 203],
      unresolved: [],
    });
  });
});
