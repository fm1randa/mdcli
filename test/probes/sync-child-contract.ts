import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readCommandStdout, runInheritedShell } from '../../src/lib/sync-child.js';

const MARKER = 'SYNC_CHILD_INHERIT_MARKER';

interface SpawnShape {
  status: number | null;
  signal: string | null;
  code: string | null;
}

function shapeOf(result: {
  status: number | null;
  signal: string | null;
  error?: Error | undefined;
}): SpawnShape {
  const error = result.error as NodeJS.ErrnoException | undefined;
  return { status: result.status, signal: result.signal, code: error?.code ?? null };
}

/** Same options the editor uses, so a stdio or shell change shows up next to the raw call. */
function pair(command: string): { direct: SpawnShape; wrapped: SpawnShape } {
  return {
    direct: shapeOf(spawnSync(command, { shell: true, stdio: 'inherit' })),
    wrapped: shapeOf(runInheritedShell(command)),
  };
}

function thrownStatus(run: () => void): { status: number | null; name: string } | null {
  try {
    run();
    return null;
  } catch (error) {
    const thrown = error as NodeJS.ErrnoException & { status?: number | null };
    return { status: thrown.status ?? null, name: thrown.name };
  }
}

const dir = mkdtempSync(join(tmpdir(), 'sync-child-'));
const touched = join(dir, 'touched');
const bare = spawnSync('printf %s "a b"');
const real = Bun.spawnSync;

let shellBlocked: { created: boolean; sawError: boolean } | undefined;
let readBlocked: { created: boolean; threw: boolean } | undefined;
try {
  Bun.spawnSync = (() => {
    throw new Error('patched-bun-spawnSync');
  }) as typeof Bun.spawnSync;
  const shell = runInheritedShell(`touch ${JSON.stringify(touched)}`);
  shellBlocked = { created: existsSync(touched), sawError: shell.error !== undefined };
  if (existsSync(touched)) unlinkSync(touched);
  try {
    readCommandStdout(`touch ${JSON.stringify(touched)}`);
    readBlocked = { created: existsSync(touched), threw: false };
  } catch {
    readBlocked = { created: existsSync(touched), threw: true };
  }
} finally {
  Bun.spawnSync = real;
}
if (shellBlocked === undefined || readBlocked === undefined) {
  throw new Error('patched Bun.spawnSync calls did not finish');
}

const report = {
  true: pair('true'),
  false: pair('false'),
  missing: pair('mdcli-no-such-command-301'),
  term: pair('kill -TERM $$'),
  printf: {
    wrapped: readCommandStdout('printf %s "a b"'),
    direct: execSync('printf %s "a b"', { encoding: 'utf-8' }),
  },
  barePrintf: {
    status: bare.status ?? null,
    code: (bare.error as NodeJS.ErrnoException | undefined)?.code ?? null,
  },
  readFalse: thrownStatus(() => {
    readCommandStdout('false');
  }),
  execFalse: thrownStatus(() => {
    execSync('false', { encoding: 'utf-8' });
  }),
  shellBlocked,
  readBlocked,
};

runInheritedShell(`printf %s ${MARKER}`);
spawnSync(`printf %s ${MARKER}`, { shell: true, stdio: 'inherit' });

const out = process.argv[2];
if (!out) throw new Error('report path required');
writeFileSync(out, JSON.stringify(report));
