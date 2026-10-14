import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getConfigPath, getFullConfig, setAuth } from '../src/lib/config.js';

const posix = process.platform !== 'win32';
let root: string;
let dir: string;
let prevDir: string | undefined;

const mode = (p: string) => statSync(p).mode & 0o777;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'mdcli-perm-'));
  dir = join(root, 'cfg');
  prevDir = process.env.MDCLI_CONFIG_DIR;
  process.env.MDCLI_CONFIG_DIR = dir;
});

afterEach(() => {
  if (prevDir === undefined) delete process.env.MDCLI_CONFIG_DIR;
  else process.env.MDCLI_CONFIG_DIR = prevDir;
  rmSync(root, { recursive: true, force: true });
});

describe.if(posix)('config permissions', () => {
  test('setAuth creates a private dir (0700) and file (0600)', () => {
    setAuth({ apiKey: 'k', uid: 'u' }, 'manual');
    expect(mode(dir)).toBe(0o700);
    expect(mode(getConfigPath())).toBe(0o600);
  });

  test('existing world-readable dir and file are tightened on load', () => {
    mkdirSync(dir, { mode: 0o755 });
    chmodSync(dir, 0o755);
    writeFileSync(getConfigPath(), JSON.stringify({ opItem: 'x' }));
    chmodSync(getConfigPath(), 0o644);
    expect(getFullConfig().opItem).toBe('x');
    expect(mode(dir)).toBe(0o700);
    expect(mode(getConfigPath())).toBe(0o600);
  });

  test('existing 0644 file is tightened on save', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(getConfigPath(), '{}');
    chmodSync(getConfigPath(), 0o644);
    setAuth({ apiKey: 'k', uid: 'u' });
    expect(mode(getConfigPath())).toBe(0o600);
  });
});
