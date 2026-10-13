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
    nameCache: {
      accounts: { byName: { nubank: 1001, itau: 1003 }, cachedAt: new Date().toISOString() },
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

describe('resolveId / resolveIds', () => {
  test('numeric identifiers win without looking up aliases', async () => {
    expect(await resolveId('accounts', '1002')).toBe(1002);
  });

  test('aliases win over the name cache', async () => {
    expect(await resolveId('accounts', 'nu')).toBe(1001);
  });

  test('falls through to the name cache when there is no alias', async () => {
    expect(await resolveId('accounts', 'Itau')).toBe(1003);
    expect(await resolveId('accounts', 'unknown')).toBeNull();
  });

  test('resolveIds splits a comma list and reports unresolved names', async () => {
    expect(await resolveIds('accounts', '1001, nu, Itau, missing')).toEqual({
      ids: [1001, 1001, 1003],
      unresolved: ['missing'],
    });
  });
});
