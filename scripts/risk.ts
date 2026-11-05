import { readFileSync } from 'node:fs';

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

type LineKind = 'add' | 'remove' | 'context';

interface DiffLine {
  kind: LineKind;
  text: string;
}

interface DiffFile {
  path: string;
  hunks: DiffLine[][];
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
  { path: /^scripts\/private-terms-corpus\.ts$/, detail: 'private-data corpus check changed' },
  { path: /^test\/private-terms\.test\.ts$/, detail: 'private-data guard test changed' },
  { path: /^test\/private-terms-corpus\.test\.ts$/, detail: 'private-data corpus check test changed' },
  { path: /^scripts\/check-private-messages\.ts$/, detail: 'private-data message guard changed' },
  { path: /^test\/check-private-messages\.test\.ts$/, detail: 'private-data message guard test changed' },
  { path: /^scripts\/verify\.sh$/, detail: 'verification script changed' },
  { path: /^eslint-rules\//, detail: 'local ESLint rule changed' },
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

const COMMENT = /^\s*(?:\/\/|\/\*|\*|\*\/)/;
// A bare leading `*` or `#` is only a comment marker when followed by a space or the line end, so a shell case
// pattern like `*)` or a JS private field like `#x` still counts as a behavior change.
const SECURITY_NON_BEHAVIOR = /^\s*(?:$|\/\/|\/\*|\*(?:\s|\/|$)|#(?:\s|!|$))/;
const TYPE_DECLARATION = /^\s*(?:export\s+)?(?:declare\s+)?(?:interface\s+\w|type\s+\w+\s*[=<]|import\s+type\b)/;
const TYPE_OPEN = /^\s*(?:export\s+)?(?:declare\s+)?(?:interface|type)\s+\w+/;

function stripTypeSyntax(line: string): string {
  return line
    .replace(/\bimport\s+type\b[^\n]*$/, '')
    .replace(
      /(?<![A-Za-z0-9_$\]>])\(([^()]*(?:\([^()]*\)[^()]*)*)\s+as\s+(?:unknown|any|[A-Z_$][\w$.]*)(?:\s*<[^>]*>)?\)/g,
      '$1',
    )
    .replace(/\s+as\s+(?:unknown|any|[A-Z_$][\w$.]*)(?:\s*<[^>]*>)?/g, '')
    .replace(/\)\s*:\s*[A-Z_$][\w$.]*(?:\s*<[^>]*>)?(?=\s*\{)/g, ')')
    .replace(/\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*:\s*[A-Za-z_$][\w$.]*(?:\s*<[^>]*>)?(?=\s*=)/g, '$1 $2')
    .replace(/\(([A-Za-z_$][\w$]*)\??\s*:\s*[A-Z_$][\w$.]*(?:\s*<[^>]*>)?(?=\))/g, '($1');
}

function typeOnlyForm(line: string): string {
  return stripTypeSyntax(line)
    .replace(/[\s;]/g, '')
    .replace(/,+$/, '');
}

function braceDelta(text: string): number {
  const opens = text.split('{').length - 1;
  const closes = text.split('}').length - 1;
  return opens - closes;
}

function diffsFrom(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  let file: DiffFile | undefined;
  let hunk: DiffLine[] | undefined;
  for (const raw of text.split('\n')) {
    const header = /^diff --git a\/(.+) b\/(.+)$/.exec(raw);
    if (header) {
      file = { path: header[2] === '/dev/null' ? header[1] : header[2], hunks: [] };
      files.push(file);
      hunk = undefined;
      continue;
    }
    if (!file) continue;
    if (raw.startsWith('@@')) {
      hunk = [];
      file.hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;
    if (raw.startsWith('+')) hunk.push({ kind: 'add', text: raw.slice(1) });
    else if (raw.startsWith('-')) hunk.push({ kind: 'remove', text: raw.slice(1) });
    else if (raw.startsWith(' ')) hunk.push({ kind: 'context', text: raw.slice(1) });
  }
  return files;
}

function markTypePairs(hunk: DiffLine[]): Set<number> {
  const ignored = new Set<number>();
  const removals = hunk.map((line, index) => ({ line, index })).filter((entry) => entry.line.kind === 'remove');
  const additions = hunk.map((line, index) => ({ line, index })).filter((entry) => entry.line.kind === 'add');
  const usedAdditions = new Set<number>();
  for (const removal of removals) {
    const form = typeOnlyForm(removal.line.text);
    const match = additions.find(
      (addition) => !usedAdditions.has(addition.index) && typeOnlyForm(addition.line.text) === form,
    );
    if (!match) continue;
    usedAdditions.add(match.index);
    ignored.add(removal.index);
    ignored.add(match.index);
  }
  return ignored;
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

function securityDetail(path: string): string | undefined {
  return SECURITY_SURFACES.find((surface) => surface.path.test(path))?.detail;
}

function changesSecurityBehavior(file: DiffFile): boolean {
  return file.hunks.some((hunk) =>
    hunk.some((line) => line.kind !== 'context' && !SECURITY_NON_BEHAVIOR.test(line.text)),
  );
}

export function classifyRisk(diff: string): RiskReport {
  const reasons: RiskReason[] = [];
  const seen = new Set<string>();
  for (const file of diffsFrom(diff)) {
    const surface = securityDetail(file.path);
    if (surface !== undefined) {
      if (changesSecurityBehavior(file)) {
        addReason(reasons, seen, { topic: 'security', path: file.path, detail: surface });
      }
      continue;
    }
    if (!file.path.startsWith('src/') || TEST_PATH.test(file.path)) continue;
    for (const hunk of file.hunks) {
      const ignored = markTypePairs(hunk);
      let typeDepth = 0;
      for (const [index, line] of hunk.entries()) {
        const changed = line.kind !== 'context';
        if (changed && !ignored.has(index)) {
          const typeOnly = COMMENT.test(line.text) || TYPE_DECLARATION.test(line.text) || typeDepth > 0;
          const topic = typeOnly ? null : topicOf(line.text);
          if (topic) {
            addReason(reasons, seen, { topic, path: file.path, detail: sensitiveDetail(topic) });
          } else if (!typeOnly && !OUTPUT_ONLY.test(line.text)) {
            for (const sensitive of sensitivity(file.path)) {
              addReason(reasons, seen, {
                topic: sensitive,
                path: file.path,
                detail: 'unclassified change in a sensitive file',
              });
            }
          }
        }
        if (TYPE_OPEN.test(line.text)) typeDepth += braceDelta(line.text);
        else if (typeDepth > 0) typeDepth = Math.max(0, typeDepth + braceDelta(line.text));
      }
    }
  }
  return { risky: reasons.length > 0, reasons };
}

function gitDiff(base: string): string {
  const result = Bun.spawnSync(
    ['git', 'diff', '--no-renames', '--no-color', `${base}...HEAD`],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  if (result.exitCode !== 0) {
    throw new Error(`git diff against ${base} failed: ${result.stderr.toString().trim()}`);
  }
  return result.stdout.toString();
}

interface Options {
  base: string;
  diff?: string;
}

function parseOptions(argv: string[]): Options {
  const options: Options = { base: 'origin/main' };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--base') {
      options.base = argv[++index] ?? options.base;
    } else if (arg === '--diff') {
      options.diff = argv[++index];
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
    const diff = options.diff ? readFileSync(options.diff, 'utf8') : gitDiff(options.base);
    const report = classifyRisk(diff);
    console.log(JSON.stringify(report, null, 2));
    if (report.risky) process.exitCode = 2;
  } catch (error) {
    console.error(`risk: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) main();
