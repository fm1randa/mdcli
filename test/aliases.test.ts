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
      accounts: [{ id: 1001, name: 'nu' }],
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
    expect(getAliases('accounts')).toEqual([{ id: 1001, name: 'nu' }]);
    expect(getAliases('tags')).toEqual([]);
  });

  test('addAlias stores a new mapping', () => {
    expect(addAlias('tags', 501, 'trab')).toEqual({ success: true });
    expect(getAliases('tags')).toEqual([{ id: 501, name: 'trab' }]);
  });

  test('addAlias refuses a duplicate name or id', () => {
    expect(addAlias('accounts', 1002, 'nu')).toEqual({
      success: false,
      error: 'Alias "nu" already exists',
    });
    expect(addAlias('accounts', 1001, 'other')).toEqual({
      success: false,
      error: 'ID 1001 already has alias "nu"',
    });
  });

  test('updateAlias renames an existing alias', () => {
    expect(updateAlias('accounts', 1001, 'nubank')).toEqual({ success: true });
    expect(getAliases('accounts')).toEqual([{ id: 1001, name: 'nubank' }]);
  });

  test('updateAlias fails when the id is missing or the name conflicts', () => {
    expect(updateAlias('accounts', 999, 'x')).toEqual({
      success: false,
      error: 'No alias found for ID 999',
    });
    addAlias('accounts', 1002, 'itau');
    expect(updateAlias('accounts', 1001, 'itau')).toEqual({
      success: false,
      error: 'Alias "itau" already exists',
    });
  });

  test('removeAlias accepts an id or a name', () => {
    expect(removeAlias('accounts', '1001')).toEqual({ success: true });
    expect(getAliases('accounts')).toEqual([]);

    addAlias('accounts', 1001, 'nu');
    expect(removeAlias('accounts', 'nu')).toEqual({ success: true });
    expect(removeAlias('accounts', 'missing')).toEqual({
      success: false,
      error: 'No alias found for "missing"',
    });
  });
});

describe('resolveId / resolveIds (offline paths)', () => {
  // These paths return before name-cache (and api.ts) load, so this file stays
  // safe to run before api-refresh.test.ts in CI's alphabetical order.
  test('numeric identifiers win without looking up aliases', async () => {
    expect(await resolveId('accounts', '1002')).toBe(1002);
  });

  test('aliases resolve offline', async () => {
    expect(await resolveId('accounts', 'nu')).toBe(1001);
  });

  test('resolveIds splits a comma list of ids and aliases', async () => {
    expect(await resolveIds('accounts', '1001, nu, 1003')).toEqual({
      ids: [1001, 1001, 1003],
      unresolved: [],
    });
  });
});
