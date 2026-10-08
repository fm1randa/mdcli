import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE } from './fixtures.js';

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

describe('request headers', () => {
  test('sends api key, uid, bearer token and auth cookie when a token is saved', async () => {
    home = createHome(MANUAL_AUTH);
    api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);

    const result = await runCli(['accounts', 'list', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    const { headers } = api.requests[0];
    expect(headers.get('mdapikey')).toBe('test-api-key');
    expect(headers.get('mduid')).toBe('42');
    expect(headers.get('authorization')).toBe('Bearer test-token');
    expect(headers.get('cookie')).toBe('mdauthtoken0=test-token');
  });

  test('omits Authorization and Cookie when no token is saved', async () => {
    home = createHome({ auth: { apiKey: 'test-api-key', uid: '42' }, authMethod: 'manual' });
    api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);

    const result = await runCli(['accounts', 'list', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    const { headers } = api.requests[0];
    expect(headers.get('mdapikey')).toBe('test-api-key');
    expect(headers.has('authorization')).toBe(false);
    expect(headers.has('cookie')).toBe(false);
  });

  test('never sends the retired Mdpolicy/Mdsignature headers', async () => {
    home = createHome(MANUAL_AUTH);
    api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);

    await runCli(['accounts', 'list', '--json'], { home, api });

    const { headers } = api.requests[0];
    expect(headers.has('mdpolicy')).toBe(false);
    expect(headers.has('mdsignature')).toBe(false);
  });
});

describe('401 handling', () => {
  test('after a manual login it asks to log in again instead of launching a browser', async () => {
    home = createHome(MANUAL_AUTH);
    api.on('GET /v1/cadastros/contas', { error: 'unauthorized' }, 401);

    const result = await runCli(['accounts', 'list'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Run "mdcli auth login" to re-authenticate');
    expect(api.requests).toHaveLength(1);
  });
});

describe('auth commands', () => {
  test('status shows the saved method without printing the full token', async () => {
    home = createHome(MANUAL_AUTH);

    const result = await runCli(['auth', 'status'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Manual entry');
    expect(result.stdout).toContain('42');
    expect(api.requests).toHaveLength(0);
  });

  test('login without a TTY fails fast with the explicit flags instead of prompting', async () => {
    home = createHome({ authMethod: 'browser-firefox' });

    const result = await runCli(['auth', 'login'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Trying last used method: Browser session (Firefox)');
    expect(result.output).toContain('No interactive terminal available');
  });
});
