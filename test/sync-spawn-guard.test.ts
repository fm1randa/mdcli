import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { run } from './run.js';

const ROOT = join(import.meta.dir, '..');
const PROBE = './test/probes/sync-spawn.ts';

/** A child `bun test` of the probe, without this worker's own BUN_TEST_WORKER_ID. */
async function probe(...flags: string[]): Promise<string[]> {
  const { BUN_TEST_WORKER_ID: _worker, ...env } = process.env;
  const result = await run([process.execPath, 'test', ...flags, PROBE], { cwd: ROOT, env });
  expect(result.exitCode, result.stderr).toBe(0);
  return `${result.stdout}\n${result.stderr}`.split('\n').filter((line) => /^(Bun|child_process)\./.test(line));
}

// A synchronous spawn hung a parallel worker now and then (oven-sh/bun#34069,
// #280, #287); the guard turns it into an error on the first call (#293).
describe('a synchronous spawn in a bun test --parallel worker', () => {
  test('throws and names what to use instead', async () => {
    const fix = 'can hang (oven-sh/bun#34069): await spawn or git from scripts/git.ts, or Bun.spawn, instead.';
    expect(await probe('--parallel')).toEqual([
      `Bun.spawnSync: Bun.spawnSync inside a bun test --parallel worker ${fix}`,
      `child_process.execSync: child_process.execSync inside a bun test --parallel worker ${fix}`,
    ]);
  });

  // The serial browser phase of `bun run test` has no worker and keeps them.
  test('still runs outside a parallel worker', async () => {
    expect(await probe()).toEqual(['Bun.spawnSync: ran', 'child_process.execSync: ran']);
  });

  // A script the worker runs inherits BUN_TEST_WORKER_ID but not the preload.
  test('still runs in a script a worker spawns', async () => {
    const result = await run([process.execPath, '-e', "process.exit(Bun.spawnSync(['true']).exitCode)"]);
    expect(result.exitCode).toBe(0);
  });
});
