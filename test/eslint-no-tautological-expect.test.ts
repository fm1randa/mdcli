import { describe, expect, test } from 'bun:test';
import { ESLint } from 'eslint';

// Lints snippets with the repo's real eslint.config.js, as eslint-local-rules.test.ts
// does; this rule has its own file to keep both under the max-lines limit.
const eslint = new ESLint({ cwd: `${import.meta.dir}/..` });

async function localRules(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(`${code}\n`, { filePath });
  const fatal = result.messages.find((m) => m.fatal);
  if (fatal) throw new Error(fatal.message);
  return result.messages.flatMap((m) => (m.ruleId?.startsWith('local/') ? [m.ruleId] : []));
}

describe('local/no-tautological-expect', () => {
  const TEST_FILE = 'test/catalog-keys.test.ts';

  test('fires on a literal compared to itself', async () => {
    expect(await localRules("test('x', () => { expect(true).toBe(true); });", TEST_FILE)).toEqual(['local/no-tautological-expect']);
    expect(await localRules("test('x', () => { expect('a').toEqual('a'); });", TEST_FILE)).toEqual(['local/no-tautological-expect']);
    expect(await localRules("test('x', () => { expect(1).toStrictEqual(1); });", TEST_FILE)).toEqual(['local/no-tautological-expect']);
  });

  test('fires on an assertion over the text of a src/ or bin/ file', async () => {
    // The form #152 used before the fix: read the file, then assert a name in it.
    const readThenAssert = "const source = await Bun.file('bin/cli.ts').text();\ntest('x', () => { expect(source).toContain('preprocessShortOptions'); });";
    expect(await localRules(readThenAssert, TEST_FILE)).toEqual(['local/no-tautological-expect']);
    expect(await localRules("test('x', async () => { expect(await Bun.file('src/program.ts').text()).toContain('x'); });", TEST_FILE)).toEqual(['local/no-tautological-expect']);
    expect(await localRules("const source = readFileSync('src/lib/api.ts', 'utf8');\ntest('x', () => { expect(source.slice(0, 10)).toContain('x'); });", TEST_FILE)).toEqual(['local/no-tautological-expect']);
  });

  test('does not fire on a real assertion, a different literal, or a non-src read', async () => {
    expect(await localRules("test('x', () => { expect(actual).toBe(true); });", TEST_FILE)).toEqual([]);
    expect(await localRules("test('x', () => { expect('a').toBe('b'); });", TEST_FILE)).toEqual([]);
    expect(await localRules("const fixture = readFileSync('test/fixtures.ts', 'utf8');\ntest('x', () => { expect(fixture).toContain('x'); });", TEST_FILE)).toEqual([]);
  });
});
