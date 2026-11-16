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
 * Replaces the synchronous spawners with ones that throw. Bun.spawnSync covers
 * `import { spawnSync } from 'bun'` too; the node:child_process default export
 * and require() see the patch, while an ESM named import of node:child_process
 * keeps the original binding.
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
