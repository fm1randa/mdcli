import { describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, runCli, startMockApi } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, TAGS_RESPONSE, entriesPage } from './fixtures.js';

// Issue #148: stdout truncated when piped. This test spawns the real CLI
// against the mock API with a large JSON response and reads the pipe one
// chunk at a time, pausing between reads. A fast reader drains the pipe before
// the CLI exits and the truncated tail goes unnoticed (#155 admitted the
// original guard passed with flushStdout reverted). The slow reader keeps the
// kernel pipe buffer full, so a missing flush loses the tail and the JSON is
// incomplete or invalid.

describe('stdout flush guard', () => {
  test('full JSON output reaches a slow reader (> 64 KiB)', async () => {
    const api = startMockApi();
    api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
    api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
    api.on('GET /v1/cadastros/tags', TAGS_RESPONSE);
    // Large enough to fill the kernel pipe buffer (65536 bytes) several times.
    const largeEntries = Array.from({ length: 2000 }, (_, i) => ({
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
        { home, api, slowStdout: true }
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
