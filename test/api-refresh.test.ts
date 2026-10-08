import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { startMockApi, type MockApi } from './helpers.js';

let api: MockApi;
let homeDir: string;
let savedHome: string | undefined;
let savedApiUrl: string | undefined;
let refreshes: number;

function writeStaleConfig(): void {
  writeFileSync(
    join(homeDir, '.config', 'mdcli', 'mdcli.config.json'),
    JSON.stringify({
      auth: { apiKey: 'stale-key', uid: '42', token: 'stale-token' },
      authMethod: 'browser-chrome',
    })
  );
}

// One server for the whole file: src/lib/api.ts reads MDCLI_API_URL once at
// import time, so per-test servers would leave later tests pointing at a
// stopped port. Each test re-registers its routes and resets the config.
beforeAll(() => {
  api = startMockApi();

  savedHome = process.env.HOME;
  savedApiUrl = process.env.MDCLI_API_URL;
  homeDir = mkdtempSync(join(tmpdir(), 'mdcli-refresh-test-'));
  process.env.HOME = homeDir;
  process.env.MDCLI_API_URL = api.url;
  mkdirSync(join(homeDir, '.config', 'mdcli'), { recursive: true });

  mock.module('../src/lib/browser-session.js', () => ({
    extractSessionFromBrowser: async () => {
      refreshes += 1;
      // Slow enough that both concurrent requests 401 while refreshing.
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { apiKey: 'fresh-key', uid: '42', token: 'fresh-token' };
    },
  }));
});

beforeEach(() => {
  writeStaleConfig();
  refreshes = 0;
});

afterAll(() => {
  api.stop();
  rmSync(homeDir, { recursive: true, force: true });
  mock.restore();
  if (savedHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = savedHome;
  }
  if (savedApiUrl === undefined) {
    delete process.env.MDCLI_API_URL;
  } else {
    process.env.MDCLI_API_URL = savedApiUrl;
  }
});

describe('concurrent refresh after 401', () => {
  test('two parallel requests share one refresh and both retry with the new credentials', async () => {
    let calls = 0;
    api.on('DELETE /v1/cadastros/contas/1001', () => {
      calls += 1;
      return calls <= 2
        ? new Response(JSON.stringify({ error: 'expired' }), { status: 401 })
        : new Response(null, { status: 204 });
    });

    const { deleteAccount } = await import('../src/lib/api.js');

    await expect(Promise.all([deleteAccount(1001), deleteAccount(1001)])).resolves.toEqual([undefined, undefined]);
    expect(refreshes).toBe(1);
    expect(calls).toBe(4);
    // Both retries went out with the refreshed credentials.
    expect(api.requests[2].headers.get('mdapikey')).toBe('fresh-key');
    expect(api.requests[3].headers.get('mdapikey')).toBe('fresh-key');
  });

  test('refresh progress goes to stderr so --json/--csv stdout stays parseable', async () => {
    let calls = 0;
    api.on('DELETE /v1/cadastros/contas/1001', () => {
      calls += 1;
      return calls === 1
        ? new Response(JSON.stringify({ error: 'expired' }), { status: 401 })
        : new Response(null, { status: 204 });
    });

    const stdout: string[] = [];
    const stderr: string[] = [];
    const origLog = console.log;
    const origError = console.error;
    console.log = (...args: unknown[]) => {
      stdout.push(args.join(' '));
    };
    console.error = (...args: unknown[]) => {
      stderr.push(args.join(' '));
    };
    try {
      const { deleteAccount } = await import('../src/lib/api.js');
      await deleteAccount(1001);
    } finally {
      console.log = origLog;
      console.error = origError;
    }

    expect(stdout.join('\n')).not.toContain('Credentials rejected');
    expect(stderr.join('\n')).toContain('Credentials rejected');
  });

  test('a failure after refresh keeps the API error body in the message', async () => {
    let calls = 0;
    api.on('DELETE /v1/cadastros/contas/1001', () => {
      calls += 1;
      if (calls === 1) {
        return new Response(JSON.stringify({ error: 'expired' }), { status: 401 });
      }
      return new Response(JSON.stringify({ error: 'account has entries' }), { status: 400 });
    });

    const { deleteAccount } = await import('../src/lib/api.js');

    await expect(deleteAccount(1001)).rejects.toThrow('account has entries');
  });
});
