import { readFileSync } from 'node:fs';

export type RiskTopic = 'auth' | 'write';

export interface RiskReason {
  topic: RiskTopic;
  path: string;
  detail: string;
}

export interface FileChange {
  path: string;
  content: string;
}

export interface RiskReport {
  risky: boolean;
  reasons: RiskReason[];
}

interface Rule {
  topic: RiskTopic;
  detail: string;
  path?: RegExp;
  content?: RegExp;
}

const AUTH_PATH =
  /^src\/(?:commands\/auth\/|lib\/(?:api|browser-auth|web-session|captcha|onepassword|config)\.ts|lib\/browser-session\/[^/]+\.ts|types\/config\.ts)/;
const AUTH_VALUE =
  /\b(?:Mdapikey|Mduid|Authorization|Bearer|mdauthtoken|apiKey|captchaApiKey|opItem|password)\b/;
const WRITE_PATH =
  /^src\/(?:lib\/api\.ts|commands\/(?:.*\/)?(?:create|update|delete)(?:-[^/]*)?\.ts|commands\/(?:entries\/import|sync)\/(?:run|commit)\.ts)$/;
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

const RULES: Rule[] = [
  { topic: 'auth', detail: 'authentication or session module', path: AUTH_PATH },
  { topic: 'auth', detail: 'credential handling', content: AUTH_VALUE },
  { topic: 'write', detail: 'data write command or API client', path: WRITE_PATH },
  { topic: 'write', detail: 'data write API call', content: WRITE_CALL },
  { topic: 'write', detail: 'raw POST/PUT/DELETE request', content: WRITE_REQUEST },
  { topic: 'write', detail: 'raw POST/PUT/DELETE method', content: WRITE_METHOD },
];

export function classifyRisk(changes: FileChange[]): RiskReport {
  const reasons: RiskReason[] = [];
  const seen = new Set<string>();
  for (const change of changes) {
    for (const rule of RULES) {
      if (rule.path && !rule.path.test(change.path)) continue;
      if (rule.content && (!change.path.startsWith('src/') || !rule.content.test(change.content))) continue;
      const key = `${rule.topic}:${change.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      reasons.push({ topic: rule.topic, path: change.path, detail: rule.detail });
    }
  }
  return { risky: reasons.length > 0, reasons };
}

function changedFiles(base: string): string[] {
  const result = Bun.spawnSync(['git', 'diff', '--name-only', '--no-renames', `${base}...HEAD`], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (result.exitCode !== 0) {
    throw new Error(`git diff against ${base} failed: ${result.stderr.toString().trim()}`);
  }
  return result.stdout.toString().split('\n').filter((file) => file !== '');
}

function readContent(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

interface Options {
  base: string;
  files?: string[];
}

function parseOptions(argv: string[]): Options {
  const options: Options = { base: 'origin/main' };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--base') {
      options.base = argv[++index] ?? options.base;
    } else if (arg === '--files') {
      options.files = (argv[++index] ?? '').split(',').filter((file) => file !== '');
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

function main(): void {
  try {
    const options = parseOptions(process.argv.slice(2));
    const files = options.files ?? changedFiles(options.base);
    const report = classifyRisk(files.map((path) => ({ path, content: readContent(path) })));
    console.log(JSON.stringify(report, null, 2));
    if (report.risky) process.exitCode = 2;
  } catch (error) {
    console.error(`risk: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) main();
