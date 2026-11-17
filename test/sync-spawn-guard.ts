import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

// Bun 1.4.2 can hang a synchronous spawn inside a `bun test --parallel` worker
// (oven-sh/bun#34069). It came back in #280 and #287: a test that passed alone
// timed out under load, and one worker hung for 13 minutes with the 20 s
// timeout never firing. A hang that shows up only sometimes is found late, so
// every synchronous spawner throws here, on the first call, with the fix (#293).
const SYNC_SPAWNERS = ['spawnSync', 'execSync', 'execFileSync'] as const;

function syncSpawnRefusal(name: string): Error {
  return new Error(
    `${name} inside a bun test --parallel worker can hang (oven-sh/bun#34069): await spawn or git from scripts/git.ts, or Bun.spawn, instead.`
  );
}

/**
 * Replaces the synchronous spawners with ones that throw. On Bun 1.4.2 a named
 * import from "bun" captured before this assignment keeps the original function
 * and still starts a child. A named import from node:child_process calls the
 * replacement, so the child does not start. local/no-sync-spawn keeps every
 * other sync import out of src/ and test/, and src/lib/sync-child.ts may import
 * the three names only from node:child_process.
 */
export function refuseSyncSpawn(): void {
  Bun.spawnSync = (() => {
    throw syncSpawnRefusal('Bun.spawnSync');
  }) as typeof Bun.spawnSync;
  for (const name of SYNC_SPAWNERS) {
    Reflect.set(childProcess, name, () => {
      throw syncSpawnRefusal(`child_process.${name}`);
    });
  }
  syncBuiltinESMExports();
}
