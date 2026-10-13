import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkForUpdate, installedCommit } from '../src/lib/self-update.js';

const LATEST = 'abcdef0123456789abcdef0123456789abcdef01';
// Shape of the entry bun writes in <BUN_INSTALL>/install/global/bun.lock.
const lockWith = (sha: string) =>
  `{\n  "packages": {\n    "mdcli": ["mdcli@github:fm1randa/mdcli#${sha}", { "bin": { "mdcli": "./bin/cli.ts" } }, "fm1randa-mdcli-${sha}", "sha512-x"],\n  }\n}\n`;

let dir: string;
let server: ReturnType<typeof Bun.serve>;
let hits: number;
let latest: string | null;
const originalConfigDir = process.env.MDCLI_CONFIG_DIR;

function globalInstall(sha: string): string {
  const root = join(dir, 'install', 'global', 'node_modules', 'mdcli');
  mkdirSync(root, { recursive: true });
  writeFileSync(join(dir, 'install', 'global', 'bun.lock'), lockWith(sha));
  return root;
}

function recorder(): { env: NodeJS.ProcessEnv; calls: () => string | null } {
  const log = join(dir, 'install-args');
  const script = join(dir, 'fake-bun');
  writeFileSync(script, `#!/bin/sh\necho "$@" > "${log}"\n`);
  chmodSync(script, 0o755);
  return {
    env: { MDCLI_UPDATE_BUN: script, MDCLI_UPDATE_CHECK_URL: `${server.url}commits/main` },
    calls: () => (existsSync(log) ? readFileSync(log, 'utf-8').trim() : null),
  };
}

async function waitFor<T>(fn: () => T | null): Promise<T | null> {
  for (let i = 0; i < 50; i++) {
    const v = fn();
    if (v) return v;
    await Bun.sleep(20);
  }
  return null;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mdcli-self-update-'));
  process.env.MDCLI_CONFIG_DIR = join(dir, 'config');
  hits = 0;
  latest = LATEST;
  server = Bun.serve({
    port: 0,
    fetch() {
      hits++;
      return latest ? Response.json({ sha: latest }) : new Response('boom', { status: 500 });
    },
  });
});

afterEach(() => {
  process.env.MDCLI_CONFIG_DIR = originalConfigDir;
  server.stop(true);
  rmSync(dir, { recursive: true, force: true });
});

describe('installedCommit', () => {
  test('reads the short sha bun recorded for a global install', () => {
    expect(installedCommit(globalInstall('bd1501f'))).toBe('bd1501f');
  });

  test('a checkout (no global bun.lock above it) is not a global install', () => {
    expect(installedCommit(join(import.meta.dir, '..'))).toBeNull();
  });
});

describe('checkForUpdate', () => {
  test('installs the exact latest commit in the background and notifies once', async () => {
    const root = globalInstall('1111111');
    const { env, calls } = recorder();
    const notices: string[] = [];
    const result = await checkForUpdate({ packageRoot: root, env, notify: (m) => notices.push(m) });
    expect(result).toBe('updating');
    expect(await waitFor(calls)).toBe(`install -g github:fm1randa/mdcli#${LATEST}`);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain('1111111 → abcdef0');
  });

  test('does nothing when the installed commit is the latest', async () => {
    const { env, calls } = recorder();
    const result = await checkForUpdate({ packageRoot: globalInstall(LATEST.slice(0, 7)), env, notify: () => {} });
    expect(result).toBe('up-to-date');
    await Bun.sleep(100);
    expect(calls()).toBeNull();
  });

  test('checks the network at most once per 24h', async () => {
    const root = globalInstall(LATEST.slice(0, 7));
    const { env } = recorder();
    const now = Date.UTC(2026, 9, 13, 12);
    expect(await checkForUpdate({ packageRoot: root, env, now })).toBe('up-to-date');
    expect(await checkForUpdate({ packageRoot: root, env, now: now + 23 * 3600e3 })).toBe('recent');
    expect(hits).toBe(1);
    expect(await checkForUpdate({ packageRoot: root, env, now: now + 25 * 3600e3 })).toBe('up-to-date');
    expect(hits).toBe(2);
  });

  test('skips without touching the network when disabled, in CI or outside a global install', async () => {
    const { env } = recorder();
    const root = globalInstall('1111111');
    expect(await checkForUpdate({ packageRoot: root, env: { ...env, MDCLI_NO_AUTO_UPDATE: '1' } })).toBe('disabled');
    expect(await checkForUpdate({ packageRoot: root, env: { ...env, CI: 'true' } })).toBe('disabled');
    expect(await checkForUpdate({ packageRoot: join(import.meta.dir, '..'), env })).toBe('not-global');
    expect(hits).toBe(0);
  });

  test('a failing or unreachable check resolves quietly without installing', async () => {
    const root = globalInstall('1111111');
    const { env, calls } = recorder();
    latest = null;
    expect(await checkForUpdate({ packageRoot: root, env, notify: () => {} })).toBe('offline');
    rmSync(join(dir, 'config'), { recursive: true, force: true });
    const unreachable = { ...env, MDCLI_UPDATE_CHECK_URL: 'http://127.0.0.1:1/commits/main' };
    expect(await checkForUpdate({ packageRoot: root, env: unreachable, notify: () => {} })).toBe('offline');
    expect(calls()).toBeNull();
  });
});
