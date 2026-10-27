import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MdcliConfig } from '../src/types/index.js';
import { SESSION_RESPONSE } from './fixtures.js';

const REPO_ROOT = join(import.meta.dir, '..');

/**
 * The local calendar day `offset` days from today (YYYY-MM-DD), where today is
 * MDCLI_TODAY when set (test/setup.ts pins it) and the machine's day otherwise
 * (the mocks under scripts/verify.sh): the same day the CLI under test reads.
 * The one "today" of tests, mocks and verify.sh. Written apart from
 * src/lib/dates.ts so a bug there makes the CLI and the expectation disagree
 * instead of agree.
 */
export function localDay(offset = 0): string {
  const pinned = process.env.MDCLI_TODAY;
  const base = pinned ? new Date(`${pinned}T12:00:00`) : new Date();
  // Date rolls 2027-02-30 over to March and turns 2027-3-1 into Invalid Date:
  // either way the day does not read back as the value that was set.
  if (pinned && (!/^\d{4}-\d{2}-\d{2}$/.test(pinned) || base.toLocaleDateString('sv-SE') !== pinned)) {
    throw new Error(`MDCLI_TODAY must be a YYYY-MM-DD calendar day, got "${pinned}"`);
  }
  base.setDate(base.getDate() + offset);
  return base.toLocaleDateString('sv-SE');
}

export interface RecordedRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Headers;
  body: unknown;
}

type Handler = (req: RecordedRequest) => unknown;

export interface MockApi {
  url: string;
  requests: RecordedRequest[];
  /** Register a JSON response for "METHOD /path" (path without the /api prefix or query string). */
  on(route: string, handler: Handler | object | null, status?: number): void;
  stop(): void;
}

export function startMockApi(): MockApi {
  const routes = new Map<string, { handler: Handler | object | null; status: number }>();
  const requests: RecordedRequest[] = [];
  // Every entries list or sum first reads the user's preferences (GET /frontend/sessao).
  routes.set('GET /v1/frontend/sessao', { handler: SESSION_RESPONSE, status: 200 });

  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname.replace(/^\/api/, '');
      const text = await req.text();
      const recorded: RecordedRequest = {
        method: req.method,
        path,
        query: url.searchParams,
        headers: req.headers,
        body: text ? JSON.parse(text) : undefined,
      };
      requests.push(recorded);

      const route = routes.get(`${req.method} ${path}`);
      if (!route) {
        return Response.json({ error: `no mock for ${req.method} ${path}` }, { status: 404 });
      }
      // A handler may be async (e.g. to delay an answer).
      const payload = typeof route.handler === 'function' ? await route.handler(recorded) : route.handler;
      // A handler may return a full Response to control the status per call
      // (e.g. 401 then success for refresh-retry tests).
      if (payload instanceof Response) {
        return payload;
      }
      if (payload === null) {
        return new Response(null, { status: route.status === 200 ? 204 : route.status });
      }
      return Response.json(payload, { status: route.status });
    },
  });

  return {
    url: `http://localhost:${server.port}/api`,
    requests,
    on(route, handler, status = 200) {
      routes.set(route, { handler, status });
    },
    stop() {
      server.stop(true);
    },
  };
}

export interface TestHome {
  dir: string;
  readConfig(): MdcliConfig;
  cleanup(): void;
}

export function createHome(config: MdcliConfig): TestHome {
  const dir = mkdtempSync(join(tmpdir(), 'mdcli-test-'));
  const configDir = join(dir, '.config', 'mdcli');
  mkdirSync(configDir, { recursive: true });
  const configPath = join(configDir, 'mdcli.config.json');
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  return {
    dir,
    readConfig: () => JSON.parse(readFileSync(configPath, 'utf-8')),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

export const MANUAL_AUTH: MdcliConfig = {
  auth: { apiKey: 'test-api-key', uid: '42', token: 'test-token' },
  authMethod: 'manual',
};

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  output: string;
}

/**
 * Environment variables through which the caller's terminal reaches a
 * spawned CLI. They are dropped from the inherited environment and set
 * explicitly per run, so the CLI prints the same on any machine.
 */
const TERMINAL_VARS = ['TERM', 'COLORTERM', 'FORCE_COLOR', 'CLICOLOR', 'CLICOLOR_FORCE', 'NO_COLOR', 'TERM_PROGRAM'];

function cliEnv(
  env: { home: TestHome; api: MockApi; extraEnv?: Record<string, string> },
  terminal: Record<string, string>
): Record<string, string | undefined> {
  const inherited = { ...process.env };
  for (const name of TERMINAL_VARS) {
    delete inherited[name];
  }
  return {
    ...inherited,
    // Point every per-user location at the temp dir so tests never read the
    // real config or browser profiles (APPDATA/LOCALAPPDATA are the Windows ones).
    HOME: env.home.dir,
    USERPROFILE: env.home.dir,
    APPDATA: env.home.dir,
    LOCALAPPDATA: env.home.dir,
    // Overrides the preload's sandbox (inherited via process.env) so the CLI
    // reads the config this test wrote.
    MDCLI_CONFIG_DIR: join(env.home.dir, '.config', 'mdcli'),
    MDCLI_API_URL: env.api.url,
    MDCLI_NO_AUTO_UPDATE: '1',
    ...terminal,
    ...env.extraEnv,
  };
}

export async function runCli(
  args: string[],
  env: { home: TestHome; api: MockApi; stdin?: string; extraEnv?: Record<string, string> }
): Promise<CliResult> {
  const proc = Bun.spawn(['bun', 'run', join(REPO_ROOT, 'bin', 'cli.ts'), ...args], {
    cwd: REPO_ROOT,
    // Piped output, as in a script: no colour.
    env: cliEnv(env, { TERM: 'dumb', NO_COLOR: '1', FORCE_COLOR: '0' }),
    stdin: env.stdin === undefined ? 'ignore' : new Blob([env.stdin]),
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr, output: stdout + stderr };
}

/** One scripted interaction: wait until the screen shows `waitFor`, then type `send`. */
export interface TerminalStep {
  waitFor: string | RegExp;
  send: string;
}

export const KEY = { enter: '\r', down: '\u001b[B', ctrlC: '\u0003' } as const;

/**
 * Run the CLI attached to a pseudo-terminal (stdin and stdout are TTYs), as a
 * person at a terminal would, so interactive prompts render and read keys.
 * Each step waits for text printed after the previous match; output is
 * returned with ANSI sequences stripped.
 */
export async function runCliInTerminal(
  args: string[],
  env: { home: TestHome; api: MockApi },
  steps: TerminalStep[],
  stepTimeoutMs = 10_000
): Promise<{ exitCode: number; output: string }> {
  let raw = '';
  const decoder = new TextDecoder();
  const proc = Bun.spawn(['bun', 'run', join(REPO_ROOT, 'bin', 'cli.ts'), ...args], {
    cwd: REPO_ROOT,
    // The pseudo-terminal below is an xterm, whatever terminal runs the tests
    // (on TERM=linux, @inquirer/prompts draws ">" instead of "❯").
    env: cliEnv(env, { TERM: 'xterm-256color', FORCE_COLOR: '0' }),
    terminal: {
      cols: 120,
      rows: 40,
      data(_terminal, data) {
        raw += decoder.decode(data, { stream: true });
      },
    },
  });
  const terminal = proc.terminal!;
  const screen = () => Bun.stripANSI(raw);

  try {
    let consumed = 0;
    for (const step of steps) {
      const deadline = Date.now() + stepTimeoutMs;
      for (;;) {
        const rest = screen().slice(consumed);
        const match = typeof step.waitFor === 'string'
          ? (() => { const i = rest.indexOf(step.waitFor); return i < 0 ? undefined : i + step.waitFor.length; })()
          : (() => { const m = step.waitFor.exec(rest); return m ? m.index + m[0].length : undefined; })();
        if (match !== undefined) {
          consumed += match;
          break;
        }
        if (Date.now() > deadline || proc.exitCode !== null) {
          throw new Error(`terminal never showed ${String(step.waitFor)}; screen:\n${screen()}`);
        }
        await Bun.sleep(20);
      }
      terminal.write(step.send);
    }
    const exitCode = await Promise.race([
      proc.exited,
      Bun.sleep(stepTimeoutMs).then(() => {
        throw new Error(`CLI did not exit; screen:\n${screen()}`);
      }),
    ]);
    return { exitCode, output: screen() };
  } finally {
    proc.kill();
    terminal.close();
  }
}

export function mutations(api: MockApi): RecordedRequest[] {
  return api.requests.filter((r) => r.method !== 'GET');
}
