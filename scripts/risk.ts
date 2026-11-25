import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { behaviorIndexes, fileChangesBehavior, parseDiff, type DiffFile } from './behavior-change.js';
import { DEFAULT_BASE, diffAgainst, parseRevisionFlag, parseValueFlag, repoRoot, revisionExists } from './git.js';
import { callPattern, mergeSurfaces, WRITE_API_CALL, writeSurface, writeSurfaceAt, type WriteSurface } from './write-surface.js';

type RiskTopic = 'auth' | 'write' | 'security';

export interface RiskReason {
  topic: RiskTopic;
  path: string;
  detail: string;
}

export interface RiskReport {
  risky: boolean;
  reasons: RiskReason[];
}

// src/lib/api.ts re-exports the client split under src/lib/api/ (#318): the
// request core there carries the auth headers and the 401 refresh, and every
// module there sends its resource's writes.
const AUTH_PATH =
  /^src\/(?:commands\/auth\/|lib\/(?:api|api\/request|browser-auth|web-session|captcha|onepassword|config|sync-child)\.ts|lib\/browser-session\/[^/]+\.ts|types\/config\.ts)/;
const WRITE_PATH =
  /^src\/(?:lib\/api(?:\/[^/]+)?\.ts|commands\/(?:.*\/)?(?:create|update|delete)(?:-[^/]*)?\.ts|commands\/(?:categories|tags)\.ts|commands\/(?:entries\/import|sync)\/(?:run|commit)\.ts)$/;

interface SecuritySurface {
  path: RegExp;
  detail: string;
}

const SECURITY_SURFACES: readonly SecuritySurface[] = [
  { path: /^scripts\/private-terms\.ts$/, detail: 'private-data guard changed' },
  { path: /^scripts\/private-terms-hashes\.ts$/, detail: 'private-data hash set changed' },
  { path: /^scripts\/private-terms-history\.ts$/, detail: 'private-data history helper changed' },
  { path: /^scripts\/private-terms-cli\.ts$/, detail: 'private-data guard entry point changed' },
  { path: /^scripts\/private-terms-corpus\.ts$/, detail: 'private-data corpus check changed' },
  { path: /^test\/private-terms\.test\.ts$/, detail: 'private-data guard test changed' },
  { path: /^test\/private-terms-corpus\.test\.ts$/, detail: 'private-data corpus check test changed' },
  { path: /^scripts\/check-private-messages\.ts$/, detail: 'private-data message guard changed' },
  { path: /^test\/check-private-messages\.test\.ts$/, detail: 'private-data message guard test changed' },
  { path: /^scripts\/verify\.sh$/, detail: 'verification script changed' },
  // The merge gates themselves: a PR that edits the classifier, the label
  // writer, the gate runner, its exemption or the proof gate would otherwise
  // be judged by the edited copy (#315).
  { path: /^scripts\/risk\.ts$/, detail: 'risk classifier changed' },
  { path: /^scripts\/write-surface\.ts$/, detail: 'write surface the risk classifier derives changed' },
  { path: /^scripts\/risk-label\.ts$/, detail: 'risk label gate changed' },
  { path: /^scripts\/new-tests-fail-on-main\.ts$/, detail: 'fails-on-main gate changed' },
  { path: /^scripts\/fails-on-main-exemption\.ts$/, detail: 'fails-on-main exemption changed' },
  { path: /^scripts\/prova\.ts$/, detail: 'proof gate changed' },
  { path: /^\.github\/workflows\//, detail: 'CI gate workflow changed' },
  { path: /^eslint-rules\//, detail: 'local ESLint rule changed' },
  // The config decides where each local rule runs: dropping scripts/** from a
  // block silences the rule there as surely as editing the rule (#272).
  { path: /^eslint\.config\.js$/, detail: 'ESLint config that scopes the local rules changed' },
  // The guard parses git output with these helpers (#262), so a change here
  // changes what the guard reads even when no guard file moves.
  { path: /^src\/utils\/parse\.ts$/, detail: 'parse helper the private-data guard imports changed' },
  // The guard spawns git and parses its diffs through these modules (#260).
  { path: /^scripts\/git\.ts$/, detail: 'child-process owner the private-data guard imports changed' },
  { path: /^scripts\/behavior-change\.ts$/, detail: 'diff parser the private-data guard imports changed' },
];

const TEST_PATH = /^(?:test\/|.*\.(?:test|spec)\.[cm]?[jt]sx?$)/;

const AUTH_BEHAVIOR =
  /\b(?:Mdapikey|Mduid|Authorization|Bearer|mdauthtoken|apiKey|captchaApiKey|opItem|password|credential|credentials|login|logout|session|cookie|token)\b/i;

const WRITE_REQUEST = /\brequest\s*<[^>]*>\s*\(\s*['"](?:POST|PUT|DELETE)['"]/;
const WRITE_METHOD = /\bmethod\s*[:=]\s*['"](?:POST|PUT|DELETE)['"]/;

const OUTPUT_ONLY =
  /\b(?:flushStdout|exitAfterFlush|process\.exit|console\.(?:log|error|warn|info|debug)|logger\.\w+|chalk\.\w+)\b/;

function commentStyle(path: string): 'js' | 'shell' {
  return path.endsWith('.sh') || path.endsWith('.yml') || path.endsWith('.yaml') ? 'shell' : 'js';
}

function topicOf(text: string, writeCall: RegExp | null): RiskTopic | null {
  if (AUTH_BEHAVIOR.test(text)) return 'auth';
  if (writeCall?.test(text) === true || WRITE_API_CALL.test(text) || WRITE_REQUEST.test(text) || WRITE_METHOD.test(text)) {
    return 'write';
  }
  return null;
}

function sensitivity(path: string, writeModules: ReadonlySet<string> | undefined): RiskTopic[] {
  const topics: RiskTopic[] = [];
  if (AUTH_PATH.test(path)) topics.push('auth');
  if (WRITE_PATH.test(path) || writeModules?.has(path) === true) topics.push('write');
  return topics;
}

function sensitiveDetail(topic: RiskTopic): string {
  return topic === 'auth'
    ? 'authentication, session or credential behavior changed'
    : 'data write behavior changed';
}

function addReason(reasons: RiskReason[], seen: Set<string>, reason: RiskReason): void {
  const key = `${reason.topic}:${reason.path}`;
  if (seen.has(key)) return;
  seen.add(key);
  reasons.push(reason);
}

export function securityDetail(path: string): string | undefined {
  return SECURITY_SURFACES.find((surface) => surface.path.test(path))?.detail;
}

function changesSecurityBehavior(file: DiffFile): boolean {
  return fileChangesBehavior(file, { commentStyle: commentStyle(file.path) });
}

interface RiskOptions {
  /** src modules that call the write API; the CLI derives them from the checkout. */
  writeModules?: ReadonlySet<string>;
  /**
   * API client functions that send a POST, PUT or DELETE. The CLI derives them
   * from the head and the base; a direct call derives them from this checkout.
   */
  writeFunctions?: ReadonlySet<string>;
}

let ownWriteFunctions: ReadonlySet<string> | undefined;

function defaultWriteFunctions(): ReadonlySet<string> {
  ownWriteFunctions ??= writeSurface(join(import.meta.dir, '..')).functions;
  return ownWriteFunctions;
}

export function classifyRisk(diff: string, options: RiskOptions = {}): RiskReport {
  const reasons: RiskReason[] = [];
  const seen = new Set<string>();
  const writeCall = callPattern(options.writeFunctions ?? defaultWriteFunctions());
  for (const file of parseDiff(diff)) {
    const surface = securityDetail(file.path);
    if (surface !== undefined) {
      if (changesSecurityBehavior(file)) {
        addReason(reasons, seen, { topic: 'security', path: file.path, detail: surface });
      }
      continue;
    }
    if (!file.path.startsWith('src/') || TEST_PATH.test(file.path)) continue;
    for (const hunk of file.hunks) {
      for (const index of behaviorIndexes(hunk, { ignoreTypeOnly: true })) {
        const line = hunk[index];
        const topic = topicOf(line.text, writeCall);
        if (topic) {
          addReason(reasons, seen, { topic, path: file.path, detail: sensitiveDetail(topic) });
        } else if (!OUTPUT_ONLY.test(line.text)) {
          for (const sensitive of sensitivity(file.path, options.writeModules)) {
            addReason(reasons, seen, {
              topic: sensitive,
              path: file.path,
              detail: 'unclassified change in a sensitive file',
            });
          }
        }
      }
    }
  }
  return { risky: reasons.length > 0, reasons };
}

interface Options {
  base: string;
  /** A caller-pinned `--base` fails when it does not resolve; a default may fall back to the head. */
  explicitBase: boolean;
  diff?: string;
}

function parseOptions(argv: string[]): Options {
  const { value, rest } = parseRevisionFlag(argv, '--base');
  const diff = parseValueFlag(rest, '--diff', 'a file');
  if (diff.rest.length > 0) throw new Error(`unknown argument: ${diff.rest[0]}`);
  return { base: value ?? DEFAULT_BASE, explicitBase: value !== undefined, diff: diff.value };
}

async function main(): Promise<void> {
  try {
    const options = parseOptions(process.argv.slice(2));
    const root = await repoRoot();
    const diff = options.diff ? readFileSync(options.diff, 'utf8') : await diffAgainst(options.base, { cwd: root });
    // A `--diff` run does not need the base to build the diff. When nobody
    // pinned one and the checkout has no origin/main, keep the run working
    // with the head surface instead of failing on the default base.
    const hasBase = options.explicitBase || (await revisionExists(options.base, root));
    let surface: WriteSurface = writeSurface(root);
    if (hasBase) {
      surface = mergeSurfaces(surface, await writeSurfaceAt(options.base, root));
    } else {
      console.error(`risk: ${options.base} does not resolve; classifying with the head write surface only`);
    }
    const report = classifyRisk(diff, { writeModules: surface.modules, writeFunctions: surface.functions });
    console.log(JSON.stringify(report, null, 2));
    if (report.risky) process.exitCode = 2;
  } catch (error) {
    console.error(`risk: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) await main();
