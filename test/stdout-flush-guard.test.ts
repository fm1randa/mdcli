import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHome, MANUAL_AUTH, runCli, startMockApi } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, TAGS_RESPONSE, entriesPage } from './fixtures.js';
import type { Entry } from '../src/types/index.js';
import { run } from './run.js';

// Issue #148: stdout truncated when piped. The CLI writes one large JSON with
// console.log and then exits; without flushStdout the process exits while the
// OS pipe still has the tail, and the reader gets invalid JSON. The payload is
// far larger than any pipe buffer, so the truncation does not depend on load.
// This guards the pinned runtime (package.json, bun 1.4.2): bun 1.4.4 flushes
// stdout on a natural exit itself, so the old code passes there.

// Issue #239: the proof only holds where the red does. Declare the runtime it
// was proven on; the guard below fails when the pin or the running Bun leaves
// it, instead of letting the proof decay into a test that passes without the
// fix.
const PROVEN_BUN = '1.4.2';
const TEST_FILE = 'test/stdout-flush-guard.test.ts';

function runtimePremiseViolation(packageManager: unknown, runtime: string): string | undefined {
  const pin =
    typeof packageManager === 'string' && packageManager.startsWith('bun@')
      ? packageManager.slice('bun@'.length)
      : String(packageManager ?? '');
  const drifted: string[] = [];
  if (pin !== PROVEN_BUN) drifted.push(`package.json pins bun@${pin || '<missing>'}`);
  if (runtime !== PROVEN_BUN) drifted.push(`this run uses Bun ${runtime}`);
  if (drifted.length === 0) return undefined;
  return `${TEST_FILE} proves its red against the pre-fix code only on Bun ${PROVEN_BUN}, but ${drifted.join(' and ')}. Reject the pin back to bun@${PROVEN_BUN}, or rewrite the test for the new runtime and update PROVEN_BUN.`;
}

describe('stdout flush guard', () => {
  test('runs on the Bun version where the pre-fix red is deterministic', () => {
    const packageJson = JSON.parse(readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8')) as {
      packageManager?: unknown;
    };
    const violation = runtimePremiseViolation(packageJson.packageManager, Bun.version);
    if (violation !== undefined) throw new Error(violation);
  });

  test('a pin outside the proven version fails, naming the test and the action', () => {
    const message = runtimePremiseViolation('bun@1.4.4', '1.4.4') ?? '';
    expect(message).toContain(TEST_FILE);
    expect(message).toContain(`Bun ${PROVEN_BUN}`);
    expect(message).toContain('bun@1.4.4');
    expect(message).toContain(`Reject the pin back to bun@${PROVEN_BUN}`);
    expect(message).toContain('rewrite the test');
    expect(runtimePremiseViolation('bun@1.4.2', '1.4.2')).toBeUndefined();
  });

  test('full JSON output reaches the reader (> 64 KiB)', async () => {
    const api = startMockApi();
    api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
    api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
    api.on('GET /v1/cadastros/tags', TAGS_RESPONSE);
    const largeEntries = Array.from({ length: 20000 }, (_, i): Entry => ({
      id: i + 1,
      descricao: `Large entry ${i + 1} with enough text to make the JSON exceed 64KB easily`,
      conta: 201,
      categoria: 10,
      tipo: 'd',
      valor: -123.45,
      data: '2026-01-05',
      dataPrevista: '2026-01-05',
      status: 'conciliado',
      conciliado: true,
    }));
    api.on('GET /v2/lancamentos', entriesPage(largeEntries));
    const home = createHome(MANUAL_AUTH);

    try {
      const result = await runCli(
        ['entries', 'list', '-a', '201', '-f', '2026-01-01', '-t', '2026-12-31', '--json'],
        { home, api }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBeGreaterThan(65536);
      const parsed = JSON.parse(result.stdout) as unknown[];
      expect(parsed.length).toBe(largeEntries.length);
    } finally {
      api.stop();
      home.cleanup();
    }
  });

  // The old bin/cli.ts unhandledRejection body exited even when flushStdout
  // rejected (`.catch(() => process.exit(1))`). A rejected flush must not
  // re-enter the handler: exitAfterFlush has to reach process.exit anyway.
  test('exitAfterFlush exits even when the flush throws', async () => {
    const helper = join(import.meta.dir, '..', 'src', 'utils', 'action.ts');
    const script = `
      const stdout = process.stdout;
      const original = stdout.write.bind(stdout);
      stdout.write = (chunk, ...rest) => {
        if (chunk === '') throw new Error('EPIPE');
        return original(chunk, ...rest);
      };
      const { exitAfterFlush } = await import(${JSON.stringify(helper)});
      await exitAfterFlush(7);
      process.exitCode = 3;
    `;

    const result = await run(['bun', '-e', script]);

    expect(result.exitCode).toBe(7);
  });
});
