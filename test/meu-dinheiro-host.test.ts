import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createTag } from '../src/lib/api.js';
import { fetchPublicApiKey } from '../src/lib/browser-session/jwt.js';
import { MANUAL_AUTH } from './helpers.js';

// The host is a security fact: credentials, the CSRF origin and the captured
// session all point at it. The expected values are literals on purpose, so a
// change to the single owner of the host shows up here (#279).
const realFetch = globalThis.fetch;
const originalApiUrl = process.env.MDCLI_API_URL;
let configDir: string;
let savedConfigDir: string | undefined;

beforeEach(() => {
  savedConfigDir = process.env.MDCLI_CONFIG_DIR;
  configDir = mkdtempSync(join(tmpdir(), 'mdcli-host-test-'));
  writeFileSync(join(configDir, 'mdcli.config.json'), JSON.stringify(MANUAL_AUTH));
  process.env.MDCLI_CONFIG_DIR = configDir;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  rmSync(configDir, { recursive: true, force: true });
  if (savedConfigDir === undefined) delete process.env.MDCLI_CONFIG_DIR;
  else process.env.MDCLI_CONFIG_DIR = savedConfigDir;
  if (originalApiUrl === undefined) delete process.env.MDCLI_API_URL;
  else process.env.MDCLI_API_URL = originalApiUrl;
});

function stubFetch(body: unknown): { url: string; headers: Headers }[] {
  const sent: { url: string; headers: Headers }[] = [];
  // Stands in for the network so the test never reaches the real host.
  globalThis.fetch = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      sent.push({ url: String(input), headers: new Headers(init?.headers) });
      return Response.json(body);
    },
    { preconnect: realFetch.preconnect }
  );
  return sent;
}

describe('Meu Dinheiro host', () => {
  test('a write goes to the production API with the web origin and referer', async () => {
    delete process.env.MDCLI_API_URL;
    const sent = stubFetch({ id: 1, nome: 'Tag Teste' });

    await createTag({ nome: 'Tag Teste', cor: '#000000', status: true });

    expect(sent.map(({ url, headers }) => ({ url, origin: headers.get('origin'), referer: headers.get('referer') }))).toEqual([
      {
        url: 'https://app.meudinheiroweb.com.br/api/v1/cadastros/tags',
        origin: 'https://app.meudinheiroweb.com.br',
        referer: 'https://app.meudinheiroweb.com.br/',
      },
    ]);
  });

  test('the public API key is read from the production session endpoint', async () => {
    const sent = stubFetch({ payload: { api: { key: 'K' } } });

    expect(await fetchPublicApiKey()).toBe('K');
    expect(sent.map((s) => s.url)).toEqual(['https://app.meudinheiroweb.com.br/api/v1/frontend/sessao']);
  });
});
