import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { ESLint } from 'eslint';

// Lints snippets with the repo's real eslint.config.js. The paths must be
// existing files: typed linting (projectService) rejects files outside the
// TS project, and lintText lints the given text instead of the file on disk.
const eslint = new ESLint({ cwd: `${import.meta.dir}/..` });

const FLOATING = '@typescript-eslint/no-floating-promises';
const AWAIT_THENABLE = '@typescript-eslint/await-thenable';
const REQUIRE_AWAIT = '@typescript-eslint/require-await';
const PROMISE_RULES = new Set([FLOATING, AWAIT_THENABLE, REQUIRE_AWAIT]);

const SRC = 'src/lib/normalize.ts';
const SCRIPTS = 'scripts/git.ts';
const TEST_FILE = 'test/replay-gates.test.ts';
const BIN = 'bin/cli.ts';
const AREAS = [SRC, SCRIPTS, TEST_FILE];

// The first typed lint builds the TypeScript program.
for (const area of [...AREAS, BIN]) {
  await eslint.lintText('export const answer = 42;\n', { filePath: area });
}

async function promiseRules(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code.endsWith('\n') ? code : `${code}\n`, { filePath });
  const fatal = result?.messages.find((message) => message.fatal);
  if (!result || fatal) throw new Error(fatal?.message ?? `no lint result for ${filePath}`);
  return result.messages.flatMap((message) =>
    message.ruleId !== null && PROMISE_RULES.has(message.ruleId) ? [message.ruleId] : [],
  );
}

function call(invocation: string): string {
  return [
    'declare function work(): Promise<void>;',
    'export async function run(): Promise<void> {',
    '  await Promise.resolve();',
    `  ${invocation}`,
    '}',
    '',
  ].join('\n');
}

const floatingCall = call('work();');
const awaitedCall = call('await work();');

describe('@typescript-eslint promise rules', () => {
  test('an unawaited promise is an error in src, scripts and test, and the awaited call is not', async () => {
    for (const filePath of AREAS) {
      expect(await promiseRules(floatingCall, filePath)).toEqual([FLOATING]);
      expect(await promiseRules(awaitedCall, filePath)).toEqual([]);
    }
  });

  test('the same unawaited call is not an error in bin/cli.ts', async () => {
    expect(await promiseRules(floatingCall, BIN)).toEqual([]);
    expect(await promiseRules(floatingCall, SRC)).toEqual([FLOATING]);
  });

  test('awaiting a non-promise is an error in src, scripts and test', async () => {
    const awaitedNumber = 'export async function run(): Promise<number> {\n  return await 1;\n}\n';
    const awaitedPromise = 'export async function run(): Promise<void> {\n  await Promise.resolve();\n}\n';
    for (const filePath of AREAS) {
      expect(await promiseRules(awaitedNumber, filePath)).toEqual([AWAIT_THENABLE]);
      expect(await promiseRules(awaitedPromise, filePath)).toEqual([]);
    }
  });

  test('async without await is an error, and returning Promise.resolve is not', async () => {
    const asyncNoAwait = 'export async function run(): Promise<number> {\n  return 1;\n}\n';
    const returnsPromise = 'export function run(): Promise<void> {\n  return Promise.resolve();\n}\n';
    for (const filePath of AREAS) {
      expect(await promiseRules(asyncNoAwait, filePath)).toEqual([REQUIRE_AWAIT]);
      expect(await promiseRules(returnsPromise, filePath)).toEqual([]);
    }
  });
});

describe('withRepo await', () => {
  const source = readFileSync(new URL('./replay-gates.test.ts', import.meta.url), 'utf8');
  const marker = 'await withRepo(';
  const markerAt = source.indexOf(marker);
  const broken = `${source.slice(0, markerAt)}${source.slice(markerAt + 'await '.length)}`;
  const callLine = source.slice(0, markerAt).split('\n').length;

  async function floatingLines(code: string): Promise<number[]> {
    const [result] = await eslint.lintText(code, { filePath: TEST_FILE });
    const fatal = result?.messages.find((message) => message.fatal);
    if (!result || fatal) throw new Error(fatal?.message ?? 'no lint result');
    return result.messages.flatMap((message) => (message.ruleId === FLOATING ? [message.line] : []));
  }

  test('replay-gates awaits withRepo, and removing that await reports the call', async () => {
    expect(markerAt).toBeGreaterThanOrEqual(0);
    expect(await floatingLines(source)).toEqual([]);
    expect(await floatingLines(broken)).toEqual([callLine]);
  });
});

describe('bun:test promise matchers', () => {
  function snippet(body: string): string {
    return [
      "import { expect } from 'bun:test';",
      'export async function run(): Promise<void> {',
      '  const p = Promise.resolve(1);',
      '  await Promise.resolve();',
      body,
      '}',
      '',
    ].join('\n');
  }

  test('expect().rejects returns void and already waits, so awaiting it is the error', async () => {
    expect(await promiseRules(snippet("  expect(p).rejects.toThrow('x');"), TEST_FILE)).toEqual([]);
    expect(await promiseRules(snippet("  await expect(p).rejects.toThrow('x');"), TEST_FILE)).toEqual([AWAIT_THENABLE]);
  });

  test('expect().toBe stays synchronous, so awaiting it is an error and leaving it is not', async () => {
    expect(await promiseRules(snippet('  await expect(p).toBe(p);'), TEST_FILE)).toEqual([AWAIT_THENABLE]);
    expect(await promiseRules(snippet('  expect(p).toBe(p);'), TEST_FILE)).toEqual([]);
  });
});
