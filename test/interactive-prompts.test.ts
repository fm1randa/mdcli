import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, KEY, MANUAL_AUTH, mutations, runCliInTerminal, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE } from './fixtures.js';

// The prompts only run when stdin and stdout are TTYs, which the piped runs in
// the rest of the suite (and verify.sh) never are. These drive the real CLI
// through a pseudo-terminal, key by key, against the in-process mock API.

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

const manualEntrySteps = [
  { waitFor: 'Mdapikey:', send: KEY.enter },
  { waitFor: 'Mdapikey is required', send: `pty-key${KEY.enter}` },
  { waitFor: 'Mduid:', send: `pty-uid${KEY.enter}` },
  { waitFor: 'Bearer Token', send: `s3cr3t-tok${KEY.enter}` },
];

describe('auth login prompts (@inquirer/prompts) on a TTY', () => {
  test('--manual reads the headers, re-asks an empty Mdapikey and masks the token', async () => {
    home = createHome({});

    const result = await runCliInTerminal(['auth', 'login', '--manual'], { home, api }, manualEntrySteps);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Authentication saved successfully!');
    expect(result.output).not.toContain('s3cr3t-tok');
    expect(result.output).toContain('**********');
    expect(home.readConfig()).toMatchObject({
      auth: { apiKey: 'pty-key', uid: 'pty-uid', token: 's3cr3t-tok' },
      authMethod: 'manual',
    });
  });

  test('after the saved method fails, the fallback menu leads to manual entry', async () => {
    // Empty HOME: no Firefox profile, so the saved method fails at once.
    home = createHome({ authMethod: 'browser-firefox' });

    const result = await runCliInTerminal(['auth', 'login'], { home, api }, [
      // Choices without Firefox: Chrome, Edge, 1Password, Browser, Manual, Cancel.
      { waitFor: 'How would you like to authenticate?', send: KEY.down.repeat(4) },
      { waitFor: '❯ Enter credentials manually', send: KEY.enter },
      ...manualEntrySteps,
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Firefox not found');
    expect(home.readConfig()).toMatchObject({ auth: { apiKey: 'pty-key', uid: 'pty-uid' }, authMethod: 'manual' });
  });

  test('Cancel in the fallback menu keeps the config as it was', async () => {
    home = createHome({ authMethod: 'browser-firefox' });

    const result = await runCliInTerminal(['auth', 'login'], { home, api }, [
      { waitFor: 'How would you like to authenticate?', send: KEY.down.repeat(5) },
      { waitFor: '❯ Cancel', send: KEY.enter },
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Authentication cancelled.');
    expect(home.readConfig()).toEqual({ authMethod: 'browser-firefox' });
  });

  test('Ctrl+C at a prompt fails without saving anything', async () => {
    home = createHome({});

    const result = await runCliInTerminal(['auth', 'login', '--manual'], { home, api }, [
      { waitFor: 'Mdapikey:', send: `half-typed${KEY.ctrlC}` },
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Authentication failed');
    expect(home.readConfig()).toEqual({});
  });
});

describe('delete confirmation on a TTY', () => {
  beforeEach(() => {
    home = createHome(MANUAL_AUTH);
    api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
    api.on('DELETE /v1/cadastros/contas/1001', null);
  });

  test('"y" deletes', async () => {
    const result = await runCliInTerminal(['accounts', 'delete', '1001'], { home, api }, [
      { waitFor: '(y/N)', send: `y${KEY.enter}` },
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Account 1001 deleted successfully!');
    expect(mutations(api).map((r) => `${r.method} ${r.path}`)).toEqual(['DELETE /v1/cadastros/contas/1001']);
  });

  test('Enter alone (default N) cancels', async () => {
    const result = await runCliInTerminal(['accounts', 'delete', '1001'], { home, api }, [
      { waitFor: '(y/N)', send: KEY.enter },
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Deletion cancelled.');
    expect(mutations(api)).toHaveLength(0);
  });
});
