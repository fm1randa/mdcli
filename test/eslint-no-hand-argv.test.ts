import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { ESLint } from 'eslint';
import { git } from '../scripts/git.js';

const ROOT = `${import.meta.dir}/..`;
const eslint = new ESLint({ cwd: ROOT });
const RULE = 'local/no-hand-argv';
const AREAS = ['scripts/risk.ts', 'src/lib/normalize.ts', 'test/helpers.ts', 'bin/cli.ts'];

// Typed linting builds each area's program on its first lintText call, which
// takes longer than a test's timeout: build them before the tests run.
for (const area of AREAS) await eslint.lintText('export const answer = 42;\n', { filePath: area });

async function hits(code: string, filePath: string): Promise<number[]> {
  const [result] = await eslint.lintText(`${code}\n`, { filePath });
  const fatal = result.messages.find((m) => m.fatal);
  if (fatal) throw new Error(fatal.message);
  return result.messages.flatMap((m) => (m.ruleId === RULE ? [m.line] : []));
}

const PRELUDE = 'declare const argv: string[];\nlet index = 0;\n';
const FORMS: Record<string, string> = {
  'a prefix step': 'export const v = argv[++index];',
  'a postfix step': 'export const v = argv[index++];',
  'a step with a fallback': "export const v = argv[++index] ?? '';",
  'a step on a member index': 'declare const state: { i: number };\nexport const v = argv[++state.i];',
};

// main when #353 was filed: every hand-written flag read the issue lists, by line.
const BEFORE = '2891978';
const COPIES: Record<string, number[]> = {
  'scripts/bun-pin.ts': [31, 32],
  'scripts/check-private-messages.ts': [77],
  'scripts/risk.ts': [181],
  'scripts/git.ts': [31],
  'scripts/replay-gates.ts': [176, 180, 184],
  'scripts/risk-label.ts': [28, 30, 32],
  'scripts/new-tests-fail-on-main.ts': [83, 85],
  'scripts/prova.ts': [107, 110],
};

describe('local/no-hand-argv', () => {
  for (const [form, code] of Object.entries(FORMS)) {
    test(`fires on ${form} in src, test, scripts and bin`, async () => {
      const line = `${PRELUDE}${code}`.split('\n').length;
      for (const area of AREAS) expect(await hits(`${PRELUDE}${code}`, area)).toEqual([line]);
    });
  }

  test('does not fire on a plain index read or a step outside the member read', async () => {
    expect(await hits(`${PRELUDE}export const v = argv[index];\nindex++;`, AREAS[0])).toEqual([]);
  });

  test(`catches every copy main carried at ${BEFORE}, and the branch carries none`, async () => {
    for (const [file, lines] of Object.entries(COPIES)) {
      expect(await hits(await git(['show', `${BEFORE}:${file}`], ROOT), file)).toEqual(lines);
      expect(await hits(readFileSync(`${ROOT}/${file}`, 'utf8'), file)).toEqual([]);
    }
  });
});
