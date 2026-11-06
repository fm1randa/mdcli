import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { ACCOUNTS_RESPONSE } from './fixtures.js';
import { MANUAL_AUTH, startMockApi } from './helpers.js';

// The credentials go where the API base URL points, so the URL is a security
// fact: unset, every request reaches the production host; set, it reaches the
// URL in force at the time of the call, not the one at import time.
let configDir: string;
let savedConfigDir: string | undefined;
const originalApiUrl = process.env.MDCLI_API_URL;
const realFetch = globalThis.fetch;

// A closed local port, set before the first import of src/lib/api.ts: a build
// that froze the URL at import time fails here instead of reaching the real host.
process.env.MDCLI_API_URL = 'http://127.0.0.1:9/api';
const { fetchAccounts } = await import('../src/lib/api.js');

beforeEach(() => {
  savedConfigDir = process.env.MDCLI_CONFIG_DIR;
  configDir = mkdtempSync(join(tmpdir(), 'mdcli-base-url-test-'));
  writeFileSync(join(configDir, 'mdcli.config.json'), JSON.stringify(MANUAL_AUTH));
  process.env.MDCLI_CONFIG_DIR = configDir;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  rmSync(configDir, { recursive: true, force: true });
  if (savedConfigDir === undefined) delete process.env.MDCLI_CONFIG_DIR;
  else process.env.MDCLI_CONFIG_DIR = savedConfigDir;
});

afterAll(() => {
  if (originalApiUrl === undefined) delete process.env.MDCLI_API_URL;
  else process.env.MDCLI_API_URL = originalApiUrl;
});

describe('API base URL', () => {
  test('without MDCLI_API_URL the request and its credentials go to the production host', async () => {
    delete process.env.MDCLI_API_URL;
    const sent: { url: string; apiKey: string | null }[] = [];
    // Stands in for the network so the test never reaches the real host.
    globalThis.fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        sent.push({ url: String(input), apiKey: new Headers(init?.headers).get('mdapikey') });
        return Response.json(ACCOUNTS_RESPONSE);
      },
      { preconnect: realFetch.preconnect }
    );

    await fetchAccounts();

    expect(sent).toEqual([
      { url: 'https://app.meudinheiroweb.com.br/api/v1/cadastros/contas?meta=true&paginate=false', apiKey: 'test-api-key' },
    ]);
  });

  test('a change to MDCLI_API_URL after import reaches the new server, not the old one', async () => {
    const first = startMockApi();
    const second = startMockApi();
    try {
      first.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
      second.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);

      process.env.MDCLI_API_URL = first.url;
      await fetchAccounts();
      process.env.MDCLI_API_URL = second.url;
      await fetchAccounts();

      expect(first.requests.map((r) => r.path)).toEqual(['/v1/cadastros/contas']);
      expect(second.requests.map((r) => r.path)).toEqual(['/v1/cadastros/contas']);
      expect(second.requests[0].headers.get('mdapikey')).toBe('test-api-key');
    } finally {
      first.stop();
      second.stop();
    }
  });
});
