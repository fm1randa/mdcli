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

function lineOf(source: string, snippet: string): number {
  const index = source.split('\n').findIndex((line) => line.includes(snippet));
  if (index === -1) throw new Error(`${snippet} is not in the ${BEFORE} source`);
  return index + 1;
}

describe('local/no-git-copy', () => {
  for (const [path, snippets] of Object.entries(COPIES)) {
    test(`fires on every copy ${path} carried at ${BEFORE}`, async () => {
      const source = git(['show', `${BEFORE}:${path}`], ROOT);
      const lines = await hits(source, path);
      for (const snippet of snippets) expect(lines).toContain(lineOf(source, snippet));
    });
  }

  test('does not fire on the owner or on a gate that goes through it', async () => {
    expect(await hits("export const result = spawn(['git', 'status']);", 'scripts/git.ts')).toEqual([]);
    const gate = [
      "import { diffAgainst, parseBase } from './git.js';",
      'const { base, rest } = parseBase(process.argv.slice(2));',
      "export const diff = rest.includes('--diff') ? '' : diffAgainst(base, { paths: ['src'] });",
      "export const message = `${base}...HEAD`;",
    ].join('\n');
    expect(await hits(gate, 'scripts/risk.ts')).toEqual([]);
  });
});
