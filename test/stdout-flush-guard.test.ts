import { describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, runCli, startMockApi } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, TAGS_RESPONSE, entriesPage } from './fixtures.js';

// Issue #148: stdout truncated at exactly 65536 bytes when piped. This test
// spawns the real CLI against the mock API with a large JSON response and
// asserts the full, valid output is received even when stdout is piped to a
// slow reader. It fails without flushStdout() because the process exits
// before stdout drains to the pipe.

describe('stdout flush guard', () => {
  test('full JSON output reaches a slow reader (> 64 KiB)', async () => {
    const api = startMockApi();
    api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
    api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
    api.on('GET /v1/cadastros/tags', TAGS_RESPONSE);
    // Large enough to exceed the kernel pipe buffer (65536 bytes).
    const largeEntries = Array.from({ length: 250 }, (_, i) => ({
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
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    } finally {
      api.stop();
      home.cleanup();
    }
  });
});
