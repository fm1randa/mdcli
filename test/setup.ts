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

// bun test runs in UTC unless TZ is set, but it does not export TZ, so a CLI
// spawned by runCli read the machine's zone instead: on a box in
// America/Sao_Paulo, between 21:00 and midnight the test's "today" was already
// tomorrow. Setting TZ here pins both this process and every subprocess (they
// inherit process.env) to one zone. The default is UTC+14, where the local day
// differs from the UTC day for 14 hours of every day, so a test or mock that
// takes "today" from UTC instead of the local calendar fails in CI most of the
// time. An explicit TZ (e.g. TZ=UTC bun run test) still wins.
process.env.TZ ??= 'Pacific/Kiritimati';

// "Today" for the whole run, read by the CLI (now()/today() in src/lib/dates.ts)
// and by the tests (localDay in test/helpers.ts), so a run that crosses
// midnight does not see two days. It defaults to the machine's local day, so
// tests stay relative to the calendar; an explicit value replays any day (e.g.
// MDCLI_TODAY=2027-03-01 bun run test).
process.env.MDCLI_TODAY ||= new Date().toLocaleDateString('sv-SE');

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true });
});
