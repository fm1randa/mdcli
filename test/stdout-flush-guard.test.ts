import { describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, runCli, startMockApi } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, TAGS_RESPONSE, entriesPage } from './fixtures.js';

// Issue #148: stdout truncated when piped. The CLI writes one large JSON with
// console.log and then exits; without flushStdout the process exits while the
// OS pipe still has the tail, and the reader gets invalid JSON. The payload is
// far larger than any pipe buffer, so the truncation does not depend on load.
// This guards the pinned runtime (package.json, bun 1.4.2): bun 1.4.4 flushes
// stdout on a natural exit itself, so the old code passes there.

describe('stdout flush guard', () => {
  test('full JSON output reaches the reader (> 64 KiB)', async () => {
    const api = startMockApi();
    api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
    api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
    api.on('GET /v1/cadastros/tags', TAGS_RESPONSE);
    const largeEntries = Array.from({ length: 20000 }, (_, i) => ({
      id: i + 1,
      descricao: `Large entry ${i + 1} with enough text to make the JSON exceed 64KB easily`,
      conta: 1001,
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
        ['entries', 'list', '-a', '1001', '-f', '2026-01-01', '-t', '2026-12-31', '--json'],
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
});
