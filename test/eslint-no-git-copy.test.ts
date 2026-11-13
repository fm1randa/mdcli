import { describe, expect, test } from 'bun:test';
import { ESLint } from 'eslint';
import { git } from '../scripts/git.js';

const ROOT = `${import.meta.dir}/..`;
const eslint = new ESLint({ cwd: ROOT });
const RULE = 'local/no-git-copy';

async function hits(code: string, filePath: string): Promise<number[]> {
  const [result] = await eslint.lintText(`${code}\n`, { filePath });
  const fatal = result.messages.find((m) => m.fatal);
  if (fatal) throw new Error(fatal.message);
  return result.messages.flatMap((m) => (m.ruleId === RULE ? [m.line] : []));
}

// main when #268 was filed: every file below still carried its own copy.
const BEFORE = 'abcef7d';
const COPIES: Record<string, string[]> = {
  'scripts/risk.ts': ["if (arg === '--base') {", '`${base}...HEAD`'],
  'scripts/prova.ts': ["if (arg === '--base') {", '`${base}...HEAD`'],
  'scripts/new-tests-fail-on-main.ts': ["if (arg === '--base') {", '`${options.base}...HEAD`'],
  'scripts/check-eslint-disables.ts': ["if (arg === '--base') {"],
  'scripts/check-private-messages.ts': ["if (arg === '--base')", "['git', '--no-pager', 'log'"],
  'scripts/private-terms-corpus.ts': ["if (arg === '--base')", '`${base}...${head}`'],
  'scripts/private-terms-history.ts': ['`${base}...${head}`'],
  'test/replay-gates.test.ts': ["Bun.spawnSync(['git', ...args]"],
  'test/private-terms.test.ts': ["Bun.spawnSync(['git', ...args]", "Bun.spawnSync(['git', 'init', '-q']"],
  'test/private-terms-corpus.test.ts': ["Bun.spawnSync(['git', ...args]", "Bun.spawnSync(['git', 'cat-file'"],
  'test/check-private-messages.test.ts': ["['git', '--no-pager', '-c'"],
  'test/eslint-rules-proof.test.ts': ["execFileSync('git', args"],
  'test/check-eslint-disables.test.ts': ["['git', '-c', 'user.name=test'"],
  'test/fails-on-main-exemption.test.ts': ["['git', '-c', 'user.name=test'"],
};

// main when #286 was filed: the --head parsers, the two-dot diff, the parent
// diff and the log range #271 left behind.
const HEAD_BEFORE = 'f41a669';
const HEAD_COPIES: Record<string, string[]> = {
  'scripts/check-eslint-disables.ts': ["if (arg === '--head') {", "const args = ['diff', '--unified=0'"],
  'scripts/private-terms-corpus.ts': ["if (arg === '--head') {"],
  'scripts/replay-gates.ts': ["diff: git(['diff'", "nameStatus: git(['diff'"],
  'scripts/check-private-messages.ts': ["gitAsync(['log', `${base}..HEAD`"],
};

function lineOf(source: string, snippet: string, rev: string): number {
  const index = source.split('\n').findIndex((line) => line.includes(snippet));
  if (index === -1) throw new Error(`${snippet} is not in the ${rev} source`);
  return index + 1;
}

describe('local/no-git-copy', () => {
  for (const [rev, copies] of [[BEFORE, COPIES], [HEAD_BEFORE, HEAD_COPIES]] as const) {
    for (const [path, snippets] of Object.entries(copies)) {
      test(`fires on every copy ${path} carried at ${rev}`, async () => {
        const source = await git(['show', `${rev}:${path}`], ROOT);
        const lines = await hits(source, path);
        for (const snippet of snippets) expect(lines).toContain(lineOf(source, snippet, rev));
      });
    }
  }

  // The forms #286 found the rule blind to, one per line.
  test('fires on a flag lookup, a concatenated or joined range and a git alias', async () => {
    const forms = [
      "export const at = process.argv.indexOf('--base');",
      "export const inline = process.argv.find((a) => a.startsWith('--base='));",
      "export const has = process.argv.includes('--head');",
      "export const dotted = (base: string) => base + '...HEAD';",
      "export const twoDots = (b: string) => ['log', `${b}..HEAD`];",
      "export const joined = (base: string) => [base, 'HEAD'].join('...');",
      "const G = 'git';",
      "export const log = [G, 'log'];",
      "export const diff = (base: string) => ['diff', '--name-only', base];",
      "export const mode = (arg: string) => { switch (arg) { case '--head': return 1; default: return 0; } };",
    ];
    expect(await hits(forms.join('\n'), 'scripts/risk.ts')).toEqual([1, 2, 3, 4, 5, 6, 7, 9, 10]);
  });

  test('does not fire on the owner or on a gate that goes through it', async () => {
    expect(await hits("export const result = spawn(['git', 'status']);", 'scripts/git.ts')).toEqual([]);
    const gate = [
      "import { diffAgainst, parseBase } from './git.js';",
      'const { base, rest } = parseBase(process.argv.slice(2));',
      "export const diff = rest.includes('--diff') ? '' : diffAgainst(base, { paths: ['src'] });",
      "export const message = `${base}...HEAD`;",
      "export const staged = ['diff', '--name-only', '-z'];",
      "export const spread = ['--', ...rest];",
    ].join('\n');
    expect(await hits(gate, 'scripts/risk.ts')).toEqual([]);
  });
});
