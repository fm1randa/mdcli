import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, KEY, runCli, runCliInTerminal, startMockApi, type MockApi, type TestHome } from './helpers.js';

// The suite must give the same result on any terminal. A claude.ai container
// runs it with TERM=linux and may force colour, while GitHub CI has no TERM:
// there, piped output came back full of ANSI codes and @inquirer/prompts drew
// ">" instead of "❯", so assertions passed in CI and failed in the cloud.
// These run the CLI from a caller whose environment looks like that container
// and expect the same output as anywhere else.
const HOSTILE_TERMINAL = { TERM: 'linux', FORCE_COLOR: '1', CLICOLOR_FORCE: '1', COLORTERM: 'truecolor' };

let api: MockApi;
let home: TestHome;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  api = startMockApi();
  home = createHome({ authMethod: 'browser-firefox' });
  saved = {};
  for (const [name, value] of Object.entries(HOSTILE_TERMINAL)) {
    saved[name] = process.env[name];
    process.env[name] = value;
  }
});

afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
  api.stop();
  home.cleanup();
});

describe('CLI output under a TERM=linux, colour-forcing caller', () => {
  test('piped output has no ANSI codes', async () => {
    const result = await runCli(['auth', 'status'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Authenticated: No');
    expect(result.output).not.toContain('\u001b[');
  });

  test('prompts on a pseudo-terminal draw the unicode pointer', async () => {
    const result = await runCliInTerminal(['auth', 'login'], { home, api }, [
      { waitFor: 'How would you like to authenticate?', send: KEY.down.repeat(5) },
      { waitFor: '❯ Cancel', send: KEY.enter },
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Authentication cancelled.');
  });
});
