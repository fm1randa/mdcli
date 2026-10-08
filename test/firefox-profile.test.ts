import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { parseFirefoxInstallDefaults } from '../src/lib/browser-session.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mdcli-firefox-ini-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeIni(name: string, content: string): string {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

describe('parseFirefoxInstallDefaults', () => {
  test('returns the install-section default', () => {
    const path = writeIni(
      'profiles.ini',
      [
        '[Profile1]',
        'Name=default',
        'IsRelative=1',
        'Path=Profiles/lxzf6zzf.default',
        'Default=1',
        '',
        '[Profile0]',
        'Name=default-release',
        'IsRelative=1',
        'Path=Profiles/0gpyfjx8.default-release',
        '',
        '[General]',
        'StartWithLastProfile=1',
        'Version=2',
        '',
        '[Install2656FF1E876E9973]',
        'Default=Profiles/0gpyfjx8.default-release',
        'Locked=1',
        '',
      ].join('\n')
    );

    expect(parseFirefoxInstallDefaults(path)).toEqual(['Profiles/0gpyfjx8.default-release']);
  });

  test('returns every install default in file order when several Firefox installs exist', () => {
    const path = writeIni(
      'profiles.ini',
      [
        '[InstallDEV]',
        'Default=Profiles/dev-edition-default',
        '',
        '[InstallRELEASE]',
        'Default=Profiles/0gpyfjx8.default-release',
        '',
      ].join('\n')
    );

    // The caller treats more than one default as ambiguous and falls back to
    // the legacy Default=1 flag instead of guessing an installation.
    expect(parseFirefoxInstallDefaults(path)).toEqual([
      'Profiles/dev-edition-default',
      'Profiles/0gpyfjx8.default-release',
    ]);
  });

  test('returns an empty list when no install section names a default', () => {
    const path = writeIni(
      'profiles.ini',
      ['[Profile0]', 'Name=default-release', 'IsRelative=1', 'Path=Profiles/abc.default-release', 'Default=1', ''].join(
        '\n'
      )
    );

    expect(parseFirefoxInstallDefaults(path)).toEqual([]);
  });

  test('returns an empty list for an install section without a Default key or with an empty one', () => {
    const lockedOnly = writeIni('a.ini', ['[InstallABC]', 'Locked=1', ''].join('\n'));
    const emptyDefault = writeIni('b.ini', ['[InstallABC]', 'Default=', 'Locked=1', ''].join('\n'));

    expect(parseFirefoxInstallDefaults(lockedOnly)).toEqual([]);
    expect(parseFirefoxInstallDefaults(emptyDefault)).toEqual([]);
  });

  test('handles CRLF line endings and absolute paths', () => {
    const path = writeIni(
      'profiles.ini',
      ['[Profile0]', 'Name=x', 'Path=C:\\Firefox\\Profiles\\abc', '', '[InstallABC]', 'Default=C:\\Firefox\\Profiles\\abc', ''].join(
        '\r\n'
      )
    );

    expect(parseFirefoxInstallDefaults(path)).toEqual(['C:\\Firefox\\Profiles\\abc']);
  });
});
