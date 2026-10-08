import { mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll } from 'bun:test';

// Preloaded before every test file (see bunfig.toml). Any code path that reaches
// src/lib/config.ts in-process writes here instead of the real
// ~/.config/mdcli/mdcli.config.json, even if a test forgets to isolate itself.
const realConfigDir = resolve(homedir(), '.config', 'mdcli');
const sandbox = mkdtempSync(join(tmpdir(), 'mdcli-test-config-'));
process.env.MDCLI_CONFIG_DIR = sandbox;

if (resolve(process.env.MDCLI_CONFIG_DIR) === realConfigDir) {
  throw new Error('MDCLI_CONFIG_DIR points at the real config; refusing to run tests');
}

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true });
});
