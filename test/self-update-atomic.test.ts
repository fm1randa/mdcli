import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkForUpdate, runManualUpdate } from '../src/lib/self-update.js';
import { waitFor } from './timeouts.js';

// #341: the update must never leave the global package missing. A stand-in for
// `bun` acts on a fake global install the way Bun does: `remove -g` deletes the
// package, a failing `install -g` leaves the current one alone, and a successful
// one writes the new version. At install time it logs whether the old package
// was still there.

let dir: string;
let root: string;
let server: ReturnType<typeof Bun.serve>;

function globalInstall(version: string): string {
  const pkg = join(dir, 'install', 'global', 'node_modules', 'mdcli');
  mkdirSync(pkg, { recursive: true });
  writeFileSync(
    join(dir, 'install', 'global', 'bun.lock'),
    `{ "packages": { "mdcli": ["mdcli@github:fm1randa/mdcli#v${version}", {}, "fm1randa-mdcli-abc1234", "sha512-x"] } }\n`,
  );
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'mdcli', version }));
  return pkg;
}

function simulatedBun(installExit: number): { env: NodeJS.ProcessEnv; log: () => string[] } {
  const log = join(dir, 'bun-log');
  const script = join(dir, 'sim-bun');
  writeFileSync(
    script,
    `#!/bin/sh
ROOT="${root}"
LOG="${log}"
case "$1" in
  remove) rm -rf "$ROOT"; echo "remove" >> "$LOG" ;;
  install)
    if [ -f "$ROOT/package.json" ]; then echo "install: old package present" >> "$LOG"; else echo "install: package missing" >> "$LOG"; fi
    if [ ${installExit} -eq 0 ]; then mkdir -p "$ROOT"; printf '{"name":"mdcli","version":"%s"}' "\${3##*#v}" > "$ROOT/package.json"; fi
    echo "done ${installExit}" >> "$LOG"
    exit ${installExit} ;;
esac
`,
  );
  chmodSync(script, 0o755);
  return {
    env: { MDCLI_UPDATE_BUN: script, MDCLI_UPDATE_CHECK_URL: `${server.url}releases/latest`, MDCLI_CONFIG_DIR: join(dir, 'config') },
    log: () => (existsSync(log) ? readFileSync(log, 'utf-8').split('\n').filter((l) => l.length > 0) : []),
  };
}

function installedVersion(): string | null {
  const file = join(root, 'package.json');
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf-8')) as { version: string }).version : null;
}

async function untilDone(log: () => string[]): Promise<string[] | null> {
  return waitFor(() => {
    const lines = log();
    return lines.some((l) => l.startsWith('done')) ? lines : null;
  });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mdcli-self-update-atomic-'));
  root = globalInstall('2026.10.13');
  server = Bun.serve({ port: 0, fetch: () => Response.json({ tag_name: 'v2026.10.20' }) });
});

afterEach(() => {
  void server.stop(true);
  rmSync(dir, { recursive: true, force: true });
});

describe('background update (#341)', () => {
  test('keeps the old package in place while the new release installs', async () => {
    const { env, log } = simulatedBun(0);
    expect(await checkForUpdate({ packageRoot: root, env, notify: () => {} })).toBe('updating');
    expect(await untilDone(log)).toEqual(['install: old package present', 'done 0']);
    expect(installedVersion()).toBe('2026.10.20');
  });

  test('a failing install leaves the old version installed', async () => {
    const { env, log } = simulatedBun(3);
    expect(await checkForUpdate({ packageRoot: root, env, notify: () => {} })).toBe('updating');
    expect(await untilDone(log)).toEqual(['install: old package present', 'done 3']);
    expect(installedVersion()).toBe('2026.10.13');
  });
});

describe('mdcli update (#341)', () => {
  test('keeps the old package in place while the new release installs', async () => {
    const { env, log } = simulatedBun(0);
    const notices: string[] = [];
    expect(await runManualUpdate({ packageRoot: root, env, notify: (m) => notices.push(m) })).toBe(0);
    expect(log()).toEqual(['install: old package present', 'done 0']);
    expect(installedVersion()).toBe('2026.10.20');
    expect(notices.at(-1)).toBe('mdcli atualizado de 2026.10.13 para 2026.10.20');
  });

  test('a failing install leaves the old version installed and says so', async () => {
    const { env, log } = simulatedBun(3);
    const notices: string[] = [];
    expect(await runManualUpdate({ packageRoot: root, env, notify: (m) => notices.push(m) })).toBe(1);
    expect(log()).toEqual(['install: old package present', 'done 3']);
    expect(installedVersion()).toBe('2026.10.13');
    expect(notices.at(-1)).toBe(
      '✗ Falha ao instalar v2026.10.20 (bun saiu com código 3). A versão 2026.10.13 continua instalada; rode `mdcli update` de novo para tentar outra vez.',
    );
  });
});
