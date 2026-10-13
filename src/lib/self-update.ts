import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';

// Self-update for global installs made with `bun install -g github:fm1randa/mdcli`.
//
// Bun extracts the GitHub tarball into <BUN_INSTALL>/install/global/node_modules/mdcli
// (no .git) and records the resolved commit in <BUN_INSTALL>/install/global/bun.lock as
// "mdcli@github:fm1randa/mdcli#<short sha>". That lockfile is our source for the
// installed commit; a checkout never has it, so it also tells global installs apart.

const REPO = 'fm1randa/mdcli';
const DEFAULT_CHECK_URL = `https://api.github.com/repos/${REPO}/commits/main`;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const CHECK_TIMEOUT_MS = 1500;
const STATE_FILE = 'update-check.json';

const LOCK_ENTRY = /"mdcli":\s*\["mdcli@github:fm1randa\/mdcli#([0-9a-f]{7,40})"/;

/** Commit of a global install, or null when `packageRoot` is not one (e.g. a git checkout). */
export function installedCommit(packageRoot: string): string | null {
  const nodeModules = dirname(packageRoot);
  if (basename(nodeModules) !== 'node_modules') return null;
  const lockFile = join(dirname(nodeModules), 'bun.lock');
  if (!existsSync(lockFile)) return null;
  try {
    return readFileSync(lockFile, 'utf-8').match(LOCK_ENTRY)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** The lockfile stores a 7-char prefix; the API returns the full SHA. */
function isOutdated(installed: string, latest: string): boolean {
  return !latest.toLowerCase().startsWith(installed.toLowerCase());
}

function stateFile(): string {
  return join(process.env.MDCLI_CONFIG_DIR || join(homedir(), '.config', 'mdcli'), STATE_FILE);
}

function lastCheck(): number {
  try {
    const { checkedAt } = JSON.parse(readFileSync(stateFile(), 'utf-8')) as { checkedAt?: number };
    return typeof checkedAt === 'number' ? checkedAt : 0;
  } catch {
    return 0;
  }
}

function recordCheck(now: number): void {
  const file = stateFile();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ checkedAt: now }), 'utf-8');
}

async function fetchLatestCommit(url: string, timeoutMs = CHECK_TIMEOUT_MS): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'mdcli-self-update' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const { sha } = (await res.json()) as { sha?: unknown };
    return typeof sha === 'string' && /^[0-9a-f]{40}$/i.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

function startInstall(sha: string, env: NodeJS.ProcessEnv): void {
  // MDCLI_UPDATE_BUN lets verify.sh swap the real install for a recorder (no network).
  const bun = env.MDCLI_UPDATE_BUN || process.execPath;
  // Pin the exact commit: with the plain spec unchanged, bun keeps the commit
  // already pinned in the global bun.lock instead of resolving main again.
  const child = spawn(bun, ['install', '-g', `github:${REPO}#${sha}`], {
    detached: true,
    stdio: 'ignore',
  });
  child.on('error', () => {});
  child.unref();
}

interface CheckOptions {
  packageRoot: string;
  now?: number;
  env?: NodeJS.ProcessEnv;
  notify?: (message: string) => void;
}

type CheckResult = 'disabled' | 'not-global' | 'recent' | 'offline' | 'up-to-date' | 'updating';

/** Never throws: the updater must not break the command being run. */
export async function checkForUpdate(opts: CheckOptions): Promise<CheckResult> {
  const env = opts.env ?? process.env;
  const now = opts.now ?? Date.now();
  const notify = opts.notify ?? ((m: string) => console.error(m));
  try {
    if (env.MDCLI_NO_AUTO_UPDATE === '1' || env.CI) return 'disabled';
    const installed = installedCommit(opts.packageRoot);
    if (!installed) return 'not-global';
    if (now - lastCheck() < CHECK_INTERVAL_MS) return 'recent';
    recordCheck(now);
    const latest = await fetchLatestCommit(env.MDCLI_UPDATE_CHECK_URL || DEFAULT_CHECK_URL);
    if (!latest) return 'offline';
    if (!isOutdated(installed, latest)) return 'up-to-date';
    startInstall(latest, env);
    notify(`mdcli: atualizando em segundo plano (${installed} → ${latest.slice(0, 7)}); a nova versão vale na próxima execução.`);
    return 'updating';
  } catch {
    return 'offline';
  }
}
