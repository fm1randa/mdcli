import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkForUpdate, compareVersions, isGlobalInstall, runManualUpdate } from '../src/lib/self-update.js';

let dir: string;
let server: ReturnType<typeof Bun.serve>;
let hits: number;
let latestTag: string | null;

// Layout `bun install -g github:fm1randa/mdcli` creates, with the installed package.json.
function globalInstall(version: string): string {
  const root = join(dir, 'install', 'global', 'node_modules', 'mdcli');
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(dir, 'install', 'global', 'bun.lock'),
    `{ "packages": { "mdcli": ["mdcli@github:fm1randa/mdcli#v${version}", {}, "fm1randa-mdcli-abc1234", "sha512-x"] } }\n`,
  );
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'mdcli', version }));
  return root;
}

function recorder(exitCode = 0): { env: NodeJS.ProcessEnv; calls: () => string | null; allCalls: () => string[] } {
  const log = join(dir, 'install-args');
  const script = join(dir, 'fake-bun');
  writeFileSync(script, `#!/bin/sh\necho "$@" >> "${log}"\nexit ${exitCode}\n`);
  chmodSync(script, 0o755);
  return {
    env: { MDCLI_UPDATE_BUN: script, MDCLI_UPDATE_CHECK_URL: `${server.url}releases/latest`, MDCLI_CONFIG_DIR: join(dir, 'config') },
    calls: () => {
      if (!existsSync(log)) return null;
      const content = readFileSync(log, 'utf-8').trim();
      if (!content) return null;
      const lines = content.split('\n');
      return lines[lines.length - 1] || null;
    },
    allCalls: () => {
      if (!existsSync(log)) return [];
      const content = readFileSync(log, 'utf-8').trim();
      if (!content) return [];
      return content.split('\n').filter((l) => l.length > 0);
    },
  };
}

async function waitFor<T>(fn: () => T | null, attempts = 50): Promise<T | null> {
  for (let i = 0; i < attempts; i++) {
    const v = fn();
    if (v) return v;
    await Bun.sleep(20);
  }
  return null;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mdcli-self-update-'));
  hits = 0;
  latestTag = 'v2026.10.20';
  server = Bun.serve({
    port: 0,
    fetch() {
      hits++;
      return latestTag ? Response.json({ tag_name: latestTag }) : new Response('boom', { status: 500 });
    },
  });
});

afterEach(() => {
  server.stop(true);
  rmSync(dir, { recursive: true, force: true });
});

describe('compareVersions', () => {
  test('orders CalVer numerically, not lexically', () => {
    expect(compareVersions('2026.10.2', '2026.9.30')).toBe(1);
    expect(compareVersions('2026.10.13', '2026.10.13')).toBe(0);
    expect(compareVersions('2026.1.1', '2025.12.31')).toBe(1);
  });

  test('a same-day re-release is newer than the base date', () => {
    expect(compareVersions('2026.10.13-2', '2026.10.13')).toBe(1);
    expect(compareVersions('2026.10.13-2', '2026.10.14')).toBe(-1);
  });
});

describe('isGlobalInstall', () => {
  test('recognizes the bun global layout but not a checkout', () => {
    expect(isGlobalInstall(globalInstall('2026.10.13'))).toBe(true);
    expect(isGlobalInstall(join(import.meta.dir, '..'))).toBe(false);
  });
});

describe('checkForUpdate', () => {
  test('installs the newer release tag in the background, silently', async () => {
    const { env, allCalls } = recorder();
    const notices: string[] = [];
    expect(await checkForUpdate({ packageRoot: globalInstall('2026.10.13'), env, notify: (m) => notices.push(m) })).toBe('updating');
    expect(await waitFor(() => {
      const c = allCalls();
      return c.length >= 2 ? c[c.length - 1] : null;
    })).toBe('install -g github:fm1randa/mdcli#v2026.10.20');
    expect(notices).toEqual([]);
  });

  test('does not install when the release is not newer', async () => {
    const { env, calls } = recorder();
    expect(await checkForUpdate({ packageRoot: globalInstall('2026.10.20'), env })).toBe('up-to-date');
    latestTag = 'v2026.10.1';
    expect(await checkForUpdate({ packageRoot: globalInstall('2026.10.20'), env: { ...env, MDCLI_CONFIG_DIR: join(dir, 'c2') } })).toBe('up-to-date');
    await Bun.sleep(100);
    expect(calls()).toBeNull();
  });

  test('ignores a latest release whose tag is not CalVer', async () => {
    const { env, calls } = recorder();
    latestTag = 'nightly';
    expect(await checkForUpdate({ packageRoot: globalInstall('2026.10.13'), env })).toBe('offline');
    expect(calls()).toBeNull();
  });

  test('checks the network at most once per 24h', async () => {
    const root = globalInstall('2026.10.20');
    const { env } = recorder();
    const now = Date.UTC(2026, 9, 13, 12);
    expect(await checkForUpdate({ packageRoot: root, env, now })).toBe('up-to-date');
    expect(await checkForUpdate({ packageRoot: root, env, now: now + 23 * 3600e3 })).toBe('recent');
    expect(hits).toBe(1);
    expect(await checkForUpdate({ packageRoot: root, env, now: now + 25 * 3600e3 })).toBe('up-to-date');
    expect(hits).toBe(2);
  });

  test('announces a version change once, on the first run after it', async () => {
    const { env } = recorder();
    const notices: string[] = [];
    const notify = (m: string) => notices.push(m);
    const opts = { env: { ...env, MDCLI_NO_AUTO_UPDATE: '1' }, notify };
    await checkForUpdate({ packageRoot: globalInstall('2026.10.13'), ...opts });
    expect(notices).toEqual([]);
    await checkForUpdate({ packageRoot: globalInstall('2026.10.20'), ...opts });
    await checkForUpdate({ packageRoot: globalInstall('2026.10.20'), ...opts });
    expect(notices).toEqual(['mdcli atualizado de 2026.10.13 para 2026.10.20']);
  });

  test('skips the network when opted out by env or config, in CI, or outside a global install', async () => {
    const { env } = recorder();
    const root = globalInstall('2026.10.13');
    expect(await checkForUpdate({ packageRoot: root, env: { ...env, MDCLI_NO_AUTO_UPDATE: '1' } })).toBe('disabled');
    expect(await checkForUpdate({ packageRoot: root, env: { ...env, CI: 'true' } })).toBe('disabled');
    writeFileSync(join(dir, 'config', 'mdcli.config.json'), JSON.stringify({ autoUpdate: false }));
    expect(await checkForUpdate({ packageRoot: root, env })).toBe('disabled');
    expect(await checkForUpdate({ packageRoot: join(import.meta.dir, '..'), env })).toBe('not-global');
    expect(hits).toBe(0);
  });

  test('background update writes remove then install in sequence', async () => {
    const { env, allCalls } = recorder();
    expect(await checkForUpdate({ packageRoot: globalInstall('2026.10.13'), env })).toBe('updating');
    const calls = await waitFor(() => {
      const c = allCalls();
      return c.length >= 2 ? c : null;
    });
    expect(calls).toBeDefined();
    expect(calls![0]).toBe('remove -g mdcli');
    expect(calls![1]).toBe('install -g github:fm1randa/mdcli#v2026.10.20');
  });

  test('finishes remove and install after the CLI that started them exits', async () => {
    const root = globalInstall('2026.10.13');
    const log = join(dir, 'install-args');
    const script = join(dir, 'slow-bun');
    // Each call outlives the parent: the old code chained the install on the
    // remove child's "exit", so exiting first dropped the install for good.
    writeFileSync(script, `#!/bin/sh\nsleep 0.3\necho "$@" >> "${log}"\n`);
    chmodSync(script, 0o755);
    const env = {
      MDCLI_UPDATE_BUN: script,
      MDCLI_UPDATE_CHECK_URL: `${server.url}releases/latest`,
      MDCLI_CONFIG_DIR: join(dir, 'config'),
    };
    const cli = join(dir, 'exiting-cli.ts');
    writeFileSync(
      cli,
      [
        `import { checkForUpdate } from ${JSON.stringify(join(import.meta.dir, '..', 'src', 'lib', 'self-update.ts'))};`,
        `await checkForUpdate({ packageRoot: process.argv[2], env: JSON.parse(process.env.CHECK_ENV || '{}') });`,
      ].join('\n'),
    );
    const proc = Bun.spawn([process.execPath, cli, root], {
      env: { ...process.env, CHECK_ENV: JSON.stringify(env) },
      stdout: 'ignore',
      stderr: 'ignore',
    });
    expect(await proc.exited).toBe(0);
    const calls = await waitFor(() => {
      const c = existsSync(log) ? readFileSync(log, 'utf-8').trim().split('\n').filter((l) => l.length > 0) : [];
      return c.length >= 2 ? c : null;
    }, 100);
    expect(calls).toEqual(['remove -g mdcli', 'install -g github:fm1randa/mdcli#v2026.10.20']);
  });

  test('keeps the update working when the bun path contains spaces', async () => {
    const spaced = join(dir, 'with space');
    mkdirSync(spaced, { recursive: true });
    const log = join(dir, 'install-args');
    const script = join(spaced, 'fake-bun');
    writeFileSync(script, `#!/bin/sh\necho "$@" >> "${log}"\n`);
    chmodSync(script, 0o755);
    const env = {
      MDCLI_UPDATE_BUN: script,
      MDCLI_UPDATE_CHECK_URL: `${server.url}releases/latest`,
      MDCLI_CONFIG_DIR: join(dir, 'config'),
    };
    expect(await checkForUpdate({ packageRoot: globalInstall('2026.10.13'), env })).toBe('updating');
    const calls = await waitFor(() => {
      const c = existsSync(log) ? readFileSync(log, 'utf-8').trim().split('\n').filter((l) => l.length > 0) : [];
      return c.length >= 2 ? c : null;
    });
    expect(calls).toEqual(['remove -g mdcli', 'install -g github:fm1randa/mdcli#v2026.10.20']);
  });

  test('a failing or unreachable check resolves quietly without installing', async () => {
    const root = globalInstall('2026.10.13');
    const { env, calls } = recorder();
    latestTag = null;
    expect(await checkForUpdate({ packageRoot: root, env })).toBe('offline');
    const unreachable = { ...env, MDCLI_UPDATE_CHECK_URL: 'http://127.0.0.1:1/releases/latest', MDCLI_CONFIG_DIR: join(dir, 'c3') };
    expect(await checkForUpdate({ packageRoot: root, env: unreachable })).toBe('offline');
    expect(calls()).toBeNull();
  });
});

describe('runManualUpdate', () => {
  test('installs the latest release in the foreground, even when auto-update is off', async () => {
    const { env, calls } = recorder();
    const notices: string[] = [];
    const code = await runManualUpdate({ packageRoot: globalInstall('2026.10.13'), env: { ...env, MDCLI_NO_AUTO_UPDATE: '1' }, notify: (m) => notices.push(m) });
    expect(code).toBe(0);
    expect(calls()).toBe('install -g github:fm1randa/mdcli#v2026.10.20');
    expect(notices.at(-1)).toBe('mdcli atualizado de 2026.10.13 para 2026.10.20');
  });

  test('reports when already up to date without installing', async () => {
    const { env, calls } = recorder();
    const notices: string[] = [];
    expect(await runManualUpdate({ packageRoot: globalInstall('2026.10.20'), env, notify: (m) => notices.push(m) })).toBe(0);
    expect(calls()).toBeNull();
    expect(notices[0]).toContain('versão mais recente (2026.10.20)');
  });

  test('fails when the install fails, the check fails, or outside a global install', async () => {
    const quiet = () => {};
    const failing = recorder(3);
    expect(await runManualUpdate({ packageRoot: globalInstall('2026.10.13'), env: failing.env, notify: quiet })).toBe(1);
    latestTag = null;
    expect(await runManualUpdate({ packageRoot: globalInstall('2026.10.13'), env: failing.env, notify: quiet })).toBe(1);
    expect(await runManualUpdate({ packageRoot: join(import.meta.dir, '..'), env: failing.env, notify: quiet })).toBe(1);
  });

  test('runs remove before install and reports sequence', async () => {
    const { env, allCalls } = recorder();
    const notices: string[] = [];
    const code = await runManualUpdate({ packageRoot: globalInstall('2026.10.13'), env, notify: (m) => notices.push(m) });
    expect(code).toBe(0);
    expect(allCalls()).toEqual([
      'remove -g mdcli',
      'install -g github:fm1randa/mdcli#v2026.10.20',
    ]);
    expect(notices.at(-1)).toBe('mdcli atualizado de 2026.10.13 para 2026.10.20');
  });

  test('fails when remove fails and does not proceed to install', async () => {
    const { env, allCalls } = recorder(3);
    const notices: string[] = [];
    const code = await runManualUpdate({ packageRoot: globalInstall('2026.10.13'), env, notify: (m) => notices.push(m) });
    expect(code).toBe(1);
    expect(allCalls()).toEqual(['remove -g mdcli']);
    expect(notices.at(-1)).toContain('Falha ao remover');
  });

  test('fails when install fails after successful remove and gives manual recovery', async () => {
    const log = join(dir, 'install-args');
    const script = join(dir, 'fake-bun-sequence');
    // First call (remove) succeeds, second call (install) fails; both are logged.
    writeFileSync(script, `#!/bin/sh\necho "$@" >> "${log}"\nif echo "$*" | grep -q "install"; then exit 3; else exit 0; fi\n`);
    chmodSync(script, 0o755);
    const envRec = {
      ...recorder().env,
      MDCLI_UPDATE_BUN: script,
      MDCLI_UPDATE_CHECK_URL: server.url + 'releases/latest',
      MDCLI_CONFIG_DIR: join(dir, 'config'),
    };
    const notices: string[] = [];
    const code = await runManualUpdate({ packageRoot: globalInstall('2026.10.13'), env: envRec, notify: (m) => notices.push(m) });
    expect(code).toBe(1);
    expect(readFileSync(log, 'utf-8').trim().split('\n').filter((l) => l.length > 0)).toEqual([
      'remove -g mdcli',
      'install -g github:fm1randa/mdcli#v2026.10.20',
    ]);
    expect(notices.at(-1)).toContain('Recuperação manual');
  });
});
