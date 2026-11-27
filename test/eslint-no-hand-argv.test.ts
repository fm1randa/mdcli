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
  // Each form below passed the rule while it listed only ++ and -- (#361).
  'a compound assignment': 'export const v = argv[(index += 1)];',
  'a plain assignment': 'export const v = argv[(index = index + 1)];',
  'a step inside an expression': 'export const v = argv[1 + index++];',
  '.at() with a step': 'export const v = argv.at(++index);',
  '.at() read by a string key': "export const v = argv['at'](index += 1);",
  '.slice() with a step': 'export const v = argv.slice(++index, index + 1)[0];',
  '.splice() read by index': 'export const v = argv.splice(index, 2)[1];',
  '.splice() read by .at()': 'export const v = argv.splice(index, 2).at(1);',
  '.splice() destructured': 'export const [, v] = argv.splice(index, 2);',
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

  test('does not fire on .at(-1), a removal whose items are not read, or a step inside a callback', async () => {
    const code = [
      'export const last = argv.at(-1);',
      'argv.splice(index, 1);',
      'export const removed = argv.splice(index, 1);',
      'export const head = argv.slice(0, index + 1);',
      'export const marks = argv.map((arg) => arg[0]);',
      'export const counts = argv.map(() => [index++]);',
    ].join('\n');
    expect(await hits(`${PRELUDE}${code}`, AREAS[0])).toEqual([]);
  });

  test('the message names the forms and the parser that replaces them', async () => {
    const [result] = await eslint.lintText(`${PRELUDE}export const v = argv.at(++index);\n`, { filePath: AREAS[0] });
    const message = result.messages.find((m) => m.ruleId === RULE)?.message ?? '';
    expect(message).toContain('argv.at(++i)');
    expect(message).toContain("parseValueFlag(argv, '--flag', 'a value') from scripts/git.ts");
  });

  test(`catches every copy main carried at ${BEFORE}, and the branch carries none`, async () => {
    for (const [file, lines] of Object.entries(COPIES)) {
      expect(await hits(await git(['show', `${BEFORE}:${file}`], ROOT), file)).toEqual(lines);
      expect(await hits(readFileSync(`${ROOT}/${file}`, 'utf8'), file)).toEqual([]);
    }
  });
});
