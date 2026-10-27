import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { createHome, KEY, runCliInTerminal, startMockApi, type MockApi, type TestHome } from './helpers.js';

// The suite must give the same result on any terminal. A claude.ai container
// runs it with TERM=linux and may force color, while GitHub CI has no TERM:
// there, piped output came back full of ANSI codes and @inquirer/prompts drew
// ">" instead of "❯", so assertions passed in CI and failed in the cloud.
// These run the suite's setup and the CLI from a caller whose environment
// looks like that container and expect the same result as anywhere else.
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

describe('test run under a TERM=linux, color-forcing caller', () => {
  test('in-process code sees a plain terminal after test/setup.ts', async () => {
    // A child `bun test` preloads test/setup.ts like this run did, but starts
    // from the hostile environment set above.
    const proc = Bun.spawn(['bun', 'test', './test/probes/terminal.ts'], {
      cwd: join(import.meta.dir, '..'),
      env: process.env,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    expect(exitCode, stderr).toBe(0);
    // stdout also carries bun's "bun test vX" banner; the probe's line is JSON.
    const report = stdout.split('\n').find((line) => line.startsWith('{'));
    expect(JSON.parse(report ?? 'null')).toEqual({ level: 0, pointer: '❯' });
  });

  test('prompts on a pseudo-terminal draw the unicode pointer', async () => {
    // Same menu as "Cancel in the fallback menu keeps the config as it was" in
    // interactive-prompts.test.ts, which runs with the TERM test/setup.ts
    // already normalized: only this hostile caller guards the explicit TERM
    // runCliInTerminal gives the pseudo-terminal.
    const result = await runCliInTerminal(['auth', 'login'], { home, api }, [
      { waitFor: 'How would you like to authenticate?', send: KEY.down.repeat(5) },
      { waitFor: '❯ Cancel', send: KEY.enter },
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Authentication cancelled.');
  });
});
