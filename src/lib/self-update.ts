import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { ensurePrivateDir, writePrivateFile } from './config.js';
import { parseInteger } from '../utils/parse.js';
import { t } from './i18n/index.js';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';

// Self-update for global installs made with `bun install -g github:fm1randa/mdcli`.
//
// The trigger is a Release (git tag `vYYYY.M.D` + GitHub Release), never the tip of
// main. Bun extracts the tarball into <BUN_INSTALL>/install/global/node_modules/mdcli
// and records it in <BUN_INSTALL>/install/global/bun.lock; that lockfile entry is how
// a global install is told apart from a checkout. The installed version is the
// package.json shipped with the install.

const REPO = 'fm1randa/mdcli';
const DEFAULT_RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const BACKGROUND_TIMEOUT_MS = 1500;
const MANUAL_TIMEOUT_MS = 10_000;
const STATE_FILE = 'update-check.json';
const CONFIG_FILE = 'mdcli.config.json';

const LOCK_ENTRY = /"mdcli@github:fm1randa\/mdcli(#[^"]*)?"/;
const RELEASE_TAG = /^v(\d{4}\.\d{1,2}\.\d{1,2}(?:-\d+)?)$/;

/** True when `packageRoot` sits in Bun's global install dir (not a git checkout). */
export function isGlobalInstall(packageRoot: string): boolean {
  const nodeModules = dirname(packageRoot);
  if (basename(nodeModules) !== 'node_modules') return false;
  try {
    return LOCK_ENTRY.test(readFileSync(join(dirname(nodeModules), 'bun.lock'), 'utf-8'));
  } catch {
    return false;
  }
}

function installedVersion(packageRoot: string): string | null {
  try {
    const { version } = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf-8')) as { version?: unknown };
    return typeof version === 'string' ? version : null;
  } catch {
    return null;
  }
}

/**
 * Compare CalVer versions `YYYY.M.D[-N]`. Same-day re-releases (`-N`) count as newer
 * than the base date, matching the release policy (not semver prerelease order).
 */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => {
    const [date, n] = v.split('-');
    return [...date.split('.').map((part) => parseInteger(part)), n === undefined ? 1 : parseInteger(n)];
  };
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < 4; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

function configDir(env: NodeJS.ProcessEnv): string {
  return env.MDCLI_CONFIG_DIR || join(homedir(), '.config', 'mdcli');
}

interface UpdateState {
  checkedAt?: number;
  seenVersion?: string;
}

function readState(env: NodeJS.ProcessEnv): UpdateState {
  try {
    return JSON.parse(readFileSync(join(configDir(env), STATE_FILE), 'utf-8')) as UpdateState;
  } catch {
    return {};
  }
}

function writeState(env: NodeJS.ProcessEnv, patch: UpdateState): void {
  const dir = configDir(env);
  ensurePrivateDir(dir);
  writePrivateFile(join(dir, STATE_FILE), JSON.stringify({ ...readState(env), ...patch }));
}

/** `"autoUpdate": false` in mdcli.config.json turns the background check off. */
function disabledInConfig(env: NodeJS.ProcessEnv): boolean {
  try {
    const config = JSON.parse(readFileSync(join(configDir(env), CONFIG_FILE), 'utf-8')) as { autoUpdate?: unknown };
    return config.autoUpdate === false;
  } catch {
    return false;
  }
}

/** Tag of the latest GitHub Release, or null on any failure. */
async function fetchLatestTag(env: NodeJS.ProcessEnv, timeoutMs: number): Promise<string | null> {
  try {
    const res = await fetch(env.MDCLI_UPDATE_CHECK_URL || DEFAULT_RELEASE_URL, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'mdcli-self-update' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const { tag_name } = (await res.json()) as { tag_name?: unknown };
    return typeof tag_name === 'string' && RELEASE_TAG.test(tag_name) ? tag_name : null;
  } catch {
    return null;
  }
}

function installArgs(tag: string): string[] {
  return ['install', '-g', `github:${REPO}#${tag}`];
}

function removeArgs(): string[] {
  return ['remove', '-g', 'mdcli'];
}

// MDCLI_UPDATE_BUN lets verify.sh and tests swap the real install for a recorder.
function bunBinary(env: NodeJS.ProcessEnv): string {
  return env.MDCLI_UPDATE_BUN || process.execPath;
}

interface Options {
  packageRoot: string;
  now?: number;
  env?: NodeJS.ProcessEnv;
  notify?: (message: string) => void;
}

type CheckResult = 'disabled' | 'not-global' | 'recent' | 'offline' | 'up-to-date' | 'updating';

/**
 * Background check run alongside every command. Never throws and never writes to
 * stdout. Also prints the one-time "mdcli atualizado de X para Y" notice.
 */
export async function checkForUpdate(opts: Options): Promise<CheckResult> {
  const env = opts.env ?? process.env;
  const now = opts.now ?? Date.now();
  const notify = opts.notify ?? ((m: string) => console.error(m));
  try {
    if (!isGlobalInstall(opts.packageRoot)) return 'not-global';
    const installed = installedVersion(opts.packageRoot);
    if (!installed) return 'offline';
    const state = readState(env);
    if (state.seenVersion !== installed) {
      if (state.seenVersion) notify(t('updateInstalled', state.seenVersion, installed));
      writeState(env, { seenVersion: installed });
    }
    if (env.MDCLI_NO_AUTO_UPDATE === '1' || env.CI || disabledInConfig(env)) return 'disabled';
    if (now - (state.checkedAt ?? 0) < CHECK_INTERVAL_MS) return 'recent';
    writeState(env, { checkedAt: now });
    const tag = await fetchLatestTag(env, BACKGROUND_TIMEOUT_MS);
    if (!tag) return 'offline';
    if (compareVersions(tag.slice(1), installed) <= 0) return 'up-to-date';
    const binary = bunBinary(env);
    const tagStr = tag;
    const seq = [
      '"$1" remove -g mdcli || exit $?',
      'exec "$1" install -g github:fm1randa/mdcli#"$2"',
    ].join('; ');
    const child = spawn('/bin/sh', ['-c', seq, 'sh', binary, tagStr], { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
    return 'updating';
  } catch {
    return 'offline';
  }
}

/** Foreground `mdcli update`: ignores opt-outs and the 24h interval. Returns an exit code. */
export async function runManualUpdate(opts: Options): Promise<number> {
  const env = opts.env ?? process.env;
  const notify = opts.notify ?? ((m: string) => console.error(m));
  if (!isGlobalInstall(opts.packageRoot)) {
    notify(t('updateNotGlobal'));
    return 1;
  }
  const installed = installedVersion(opts.packageRoot) ?? '0';
  const tag = await fetchLatestTag(env, MANUAL_TIMEOUT_MS);
  if (!tag) {
    notify(t('updateCheckFailed'));
    return 1;
  }
  writeState(env, { checkedAt: opts.now ?? Date.now() });
  const latest = tag.slice(1);
  if (compareVersions(latest, installed) <= 0) {
    notify(t('updateAlreadyLatest', installed));
    return 0;
  }
  notify(t('updateUpdating', installed, latest));
  const removeCode = await new Promise<number>((resolve) => {
    const child = spawn(bunBinary(env), removeArgs(), { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', () => resolve(1));
    child.on('exit', (c) => resolve(c ?? 1));
  });
  if (removeCode !== 0) {
    notify(t('updateRemoveFailed', removeCode));
    return 1;
  }
  const code = await new Promise<number>((resolve) => {
    const child = spawn(bunBinary(env), installArgs(tag), { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', () => resolve(1));
    child.on('exit', (c) => resolve(c ?? 1));
  });
  if (code !== 0) {
    notify(t('updateInstallFailed', tag, code));
    return 1;
  }
  writeState(env, { seenVersion: latest });
  notify(t('updateInstalled', installed, latest));
  return 0;
}
