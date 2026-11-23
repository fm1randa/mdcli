import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './run.js';

const ROOT = join(import.meta.dir, '..');
const MARKER = 'SYNC_CHILD_INHERIT_MARKER';
const QUIET = { status: 0, signal: null, code: null };

describe('sync-child', () => {
  test('matches spawnSync and execSync, inherits stdio, and stops when Bun.spawnSync throws', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sync-child-report-'));
    const reportPath = join(dir, 'report.json');
    const result = await run([process.execPath, 'test/probes/sync-child-contract.ts', reportPath], { cwd: ROOT });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toBe(MARKER + MARKER);
    expect(JSON.parse(readFileSync(reportPath, 'utf8'))).toEqual({
      true: { direct: QUIET, wrapped: QUIET },
      false: {
        direct: { status: 1, signal: null, code: null },
        wrapped: { status: 1, signal: null, code: null },
      },
      missing: {
        direct: { status: 127, signal: null, code: null },
        wrapped: { status: 127, signal: null, code: null },
      },
      term: {
        direct: { status: null, signal: 'SIGTERM', code: null },
        wrapped: { status: null, signal: 'SIGTERM', code: null },
      },
      printf: { wrapped: 'a b', direct: 'a b' },
      barePrintf: { status: null, code: 'ENOENT' },
      readFalse: { status: 1, name: 'Error' },
      execFalse: { status: 1, name: 'Error' },
      shellBlocked: { created: false, sawError: true },
      readBlocked: { created: false, threw: true },
    });
  });
});
