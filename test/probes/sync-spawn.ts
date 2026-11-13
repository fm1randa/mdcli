import { expect, test } from 'bun:test';
import childProcess from 'node:child_process';

// Run by test/sync-spawn-guard.test.ts with and without --parallel: each
// probe prints what a synchronous spawn did, so the parent sees the guard.
function attempt(name: string, spawn: () => unknown): void {
  try {
    spawn();
    console.log(`${name}: ran`);
  } catch (error) {
    console.log(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

test('probe', () => {
  attempt('Bun.spawnSync', () => Bun.spawnSync(['true']));
  attempt('child_process.execSync', () => childProcess.execSync('true'));
  expect(true).toBe(true);
});
