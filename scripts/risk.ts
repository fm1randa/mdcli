import { readFileSync } from 'node:fs';
import { behaviorIndexes, fileChangesBehavior, parseDiff, type DiffFile } from './behavior-change.js';
import { diffAgainst, parseBase } from './git.js';

export type RiskTopic = 'auth' | 'write' | 'security';

export interface RiskReason {
  topic: RiskTopic;
  path: string;
  detail: string;
}

export interface RiskReport {
  risky: boolean;
  reasons: RiskReason[];
}

const AUTH_PATH =
  /^src\/(?:commands\/auth\/|lib\/(?:api|browser-auth|web-session|captcha|onepassword|config)\.ts|lib\/browser-session\/[^/]+\.ts|types\/config\.ts)/;
const WRITE_PATH =
  /^src\/(?:lib\/api\.ts|commands\/(?:.*\/)?(?:create|update|delete)(?:-[^/]*)?\.ts|commands\/(?:categories|tags)\.ts|commands\/(?:entries\/import|sync)\/(?:run|commit)\.ts)$/;

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
  { path: /^eslint-rules\//, detail: 'local ESLint rule changed' },
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

const WRITE_FUNCTIONS = [
  'createCategory',
  'updateCategory',
  'deleteCategory',
  'suggestCategoriesWithAi',
  'markBankTransactionsImported',
  'conciliateBankTransactions',
  'importBankTransactions',
  'requestSync',
  'createAccount',
  'updateAccount',
  'deleteAccount',
  'createTag',
  'updateTag',
  'deleteTag',
  'createEntry',
  'updateEntry',
  'deleteEntry',
].join('|');
const WRITE_CALL = new RegExp(`\\b(?:${WRITE_FUNCTIONS})\\s*\\(`);
const WRITE_REQUEST = /\brequest\s*<[^>]*>\s*\(\s*['"](?:POST|PUT|DELETE)['"]/;
const WRITE_METHOD = /\bmethod\s*[:=]\s*['"](?:POST|PUT|DELETE)['"]/;

const OUTPUT_ONLY =
  /\b(?:flushStdout|exitAfterFlush|process\.exit|console\.(?:log|error|warn|info|debug)|logger\.\w+|chalk\.\w+)\b/;

function commentStyle(path: string): 'js' | 'shell' {
  return path.endsWith('.sh') ? 'shell' : 'js';
}

function topicOf(text: string): RiskTopic | null {
  if (AUTH_BEHAVIOR.test(text)) return 'auth';
  if (WRITE_CALL.test(text) || WRITE_REQUEST.test(text) || WRITE_METHOD.test(text)) return 'write';
  return null;
}

function sensitivity(path: string): RiskTopic[] {
  const topics: RiskTopic[] = [];
  if (AUTH_PATH.test(path)) topics.push('auth');
  if (WRITE_PATH.test(path)) topics.push('write');
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

export function classifyRisk(diff: string): RiskReport {
  const reasons: RiskReason[] = [];
  const seen = new Set<string>();
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
        const topic = topicOf(line.text);
        if (topic) {
          addReason(reasons, seen, { topic, path: file.path, detail: sensitiveDetail(topic) });
        } else if (!OUTPUT_ONLY.test(line.text)) {
          for (const sensitive of sensitivity(file.path)) {
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
  diff?: string;
}

function parseOptions(argv: string[]): Options {
  const { base, rest } = parseBase(argv);
  const options: Options = { base };
  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index];
    if (arg === '--diff') {
      options.diff = rest[++index];
      if (!options.diff) throw new Error('--diff needs a file');
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

function main(): void {
  try {
    const options = parseOptions(process.argv.slice(2));
    const diff = options.diff ? readFileSync(options.diff, 'utf8') : diffAgainst(options.base);
    const report = classifyRisk(diff);
    console.log(JSON.stringify(report, null, 2));
    if (report.risky) process.exitCode = 2;
  } catch (error) {
    console.error(`risk: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) main();
