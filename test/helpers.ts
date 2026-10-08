import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MdcliConfig } from '../src/types/index.js';

const REPO_ROOT = join(import.meta.dir, '..');

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
      const payload = typeof route.handler === 'function' ? route.handler(recorded) : route.handler;
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

export async function runCli(args: string[], env: { home: TestHome; api: MockApi; stdin?: string }): Promise<CliResult> {
  const proc = Bun.spawn(['bun', 'run', join(REPO_ROOT, 'bin', 'cli.ts'), ...args], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      // Point every per-user location at the temp dir so tests never read the
      // real config or browser profiles (APPDATA/LOCALAPPDATA are the Windows ones).
      HOME: env.home.dir,
      USERPROFILE: env.home.dir,
      APPDATA: env.home.dir,
      LOCALAPPDATA: env.home.dir,
      MDCLI_API_URL: env.api.url,
      FORCE_COLOR: '0',
    },
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

export function mutations(api: MockApi): RecordedRequest[] {
  return api.requests.filter((r) => r.method !== 'GET');
}
