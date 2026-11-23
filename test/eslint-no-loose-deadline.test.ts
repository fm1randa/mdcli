import { describe, expect, test } from 'bun:test';
import { ESLint } from 'eslint';

const eslint = new ESLint({ cwd: `${import.meta.dir}/..` });

async function localRules(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(`${code}\n`, { filePath });
  const fatal = result.messages.find((message) => message.fatal);
  if (fatal) throw new Error(fatal.message);
  return result.messages.flatMap((message) => (message.ruleId?.startsWith('local/') ? [message.ruleId] : []));
}

const RULE = 'local/no-loose-deadline';

describe('local/no-loose-deadline', () => {
  test('fires on the self-update sleep', async () => {
    expect(await localRules('await Bun.sleep(100);', 'test/self-update.test.ts')).toEqual([RULE]);
  });

  test('fires on Bun.sleep reached through a global object', async () => {
    expect(await localRules('await globalThis.Bun.sleep(100);', 'test/self-update.test.ts')).toEqual([RULE]);
    expect(await localRules('await global.Bun.sleep(100);', 'test/self-update.test.ts')).toEqual([RULE]);
    expect(await localRules('await self.Bun.sleep(100);', 'test/self-update.test.ts')).toEqual([RULE]);
    expect(await localRules('await window.Bun.sleep(100);', 'test/self-update.test.ts')).toEqual([RULE]);
  });

  test('fires on Bun.sleep read by a computed static key', async () => {
    expect(await localRules('await Bun["sleep"](100);', 'test/self-update.test.ts')).toEqual([RULE]);
    expect(await localRules('await Bun[`sleep`](100);', 'test/self-update.test.ts')).toEqual([RULE]);
    expect(await localRules('await globalThis["Bun"].sleep(100);', 'test/self-update.test.ts')).toEqual([RULE]);
    expect(await localRules('await globalThis["Bun"]["sleep"](100);', 'test/self-update.test.ts')).toEqual([RULE]);
    expect(await localRules('chromium.launch({ ["timeout"]: 10_000 });', 'test/browser-helpers.ts')).toEqual([RULE]);
    expect(await localRules('export const deadline = Date["now"]() + 10_000;', 'test/helpers.ts')).toEqual([RULE]);
  });

  test('fires on the helpers deadline the before fixture keeps', async () => {
    expect(await localRules('stepTimeoutMs = 10_000;', 'test/helpers.ts')).toEqual([RULE]);
    expect(await localRules('await Bun.sleep(20);', 'test/helpers.ts')).toEqual([RULE]);
    expect(await localRules('const pause = 100;\nawait Bun.sleep(pause);', 'test/self-update.test.ts')).toEqual([RULE]);
    expect(await localRules('export const deadline = Date.now() + 10_000;', 'test/helpers.ts')).toEqual([RULE]);
    expect(await localRules('export const deadline = performance.now() + 10_000;', 'test/helpers.ts')).toEqual([RULE]);
    expect(await localRules('chromium.launch({ timeout: 10_000 });', 'test/browser-helpers.ts')).toEqual([RULE]);
  });

  test('allows an import, a parameter, setTimeout, a second binding, and arithmetic', async () => {
    expect(await localRules("import { QUIET_WINDOW_MS } from './timeouts.js';\nawait Bun.sleep(QUIET_WINDOW_MS);", 'test/self-update.test.ts')).toEqual([]);
    expect(await localRules("import { QUIET_WINDOW_MS } from './timeouts.js';\nawait globalThis.Bun.sleep(QUIET_WINDOW_MS);", 'test/self-update.test.ts')).toEqual([]);
    expect(await localRules('function slow(ms: number) { return Bun.sleep(ms); }', 'test/entries-card-concurrency.test.ts')).toEqual([]);
    expect(await localRules('setTimeout(resolve, 50);', 'test/api-refresh.test.ts')).toEqual([]);
    expect(await localRules('setTimeout(r, 0);', 'test/concurrency.test.ts')).toEqual([]);
    expect(await localRules('const DELAY_MS = 80;\nsetTimeout(() => {}, DELAY_MS);', 'test/expect-matcher-runtime.test.ts')).toEqual([]);
    expect(await localRules('const pause = 100;\nconst wait = pause;\nawait Bun.sleep(wait);', 'test/self-update.test.ts')).toEqual([]);
    expect(await localRules('await Bun.sleep(50 + 50);', 'test/self-update.test.ts')).toEqual([]);
    expect(
      await localRules("import { BROWSER_LAUNCH_TIMEOUT_MS } from './timeouts.js';\nchromium.launch({ timeout: BROWSER_LAUNCH_TIMEOUT_MS });", 'test/browser-helpers.ts'),
    ).toEqual([]);
  });

  test('is off in the owner and outside test/', async () => {
    expect(await localRules('await Bun.sleep(100);', 'test/timeouts.ts')).toEqual([]);
    expect(await localRules('await Bun.sleep(100);', 'src/lib/api.ts')).toEqual([]);
    expect(await localRules('await Bun.sleep(100);', 'scripts/risk.ts')).toEqual([]);
  });
});
