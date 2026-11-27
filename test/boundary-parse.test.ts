import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHome, MANUAL_AUTH, offContract, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE } from './fixtures.js';

// #362: mdcli.config.json and the type=sum answer were cast to their types
// unchecked, so a `null` config crashed every command and a malformed sum
// reached the table. They are now validated where they are read.

let api: MockApi;
let home: TestHome;

function writeConfig(text: string): void {
  writeFileSync(join(home.dir, '.config', 'mdcli', 'mdcli.config.json'), text);
}

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v2/lancamentos', { sum: [{ conta: 201, projetado: 555, confirmado: 600 }] });
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

describe('a config file that does not match MdcliConfig', () => {
  test('a null config reads as a fresh one instead of crashing', async () => {
    writeConfig('null');
    const result = await runCli(['auth', 'status'], { home, api });
    expect(result.output).not.toContain('TypeError');
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Authenticated: No');
  });

  test('an auth that is not { apiKey, uid } counts as logged out and sends nothing', async () => {
    writeConfig('{"auth":"oops","authMethod":"manual"}');
    const result = await runCli(['accounts', 'list'], { home, api });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Not authenticated. Run "mdcli auth login" first.');
    expect(api.requests).toEqual([]);
  });

  test('a valid config with an extra broken field still authenticates', async () => {
    writeConfig('{"auth":{"apiKey":"test-api-key","uid":"42"},"authMethod":"manual","nameCache":"x","autoUpdate":"no"}');
    const result = await runCli(['accounts', 'list'], { home, api });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Conta Teste');
    expect(api.requests[0]?.headers.get('Mdapikey')).toBe('test-api-key');
  });
});

describe('a type=sum answer that is not { sum: [...] }', () => {
  test('fails with the endpoint named instead of printing a broken table', async () => {
    api.on('GET /v2/lancamentos', offContract({ sum: [{ conta: 201, projetado: '555', confirmado: 600 }] }));
    const result = await runCli(['accounts', 'list'], { home, api });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('API returned a response in an unexpected shape (GET /v2/lancamentos type=sum).');
  });

  test('a row that is not an account, like the web\'s residuo row, is skipped', async () => {
    api.on('GET /v2/lancamentos', offContract({ sum: [{ conta: 'residuo', projetado: 0, confirmado: 0 }, { conta: 201, projetado: 555, confirmado: 600 }] }));
    const result = await runCli(['accounts', 'list', '--json'], { home, api });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toContainEqual(expect.objectContaining({ id: 201, balance: 600, projectedBalance: 555 }));
  });

  test('a body without sum fails the same way', async () => {
    api.on('GET /v2/lancamentos', offContract({}));
    const result = await runCli(['accounts', 'list'], { home, api });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('API returned a response in an unexpected shape (GET /v2/lancamentos type=sum).');
  });
});
