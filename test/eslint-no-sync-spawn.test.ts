import { describe, expect, test } from 'bun:test';
import { ESLint } from 'eslint';

const eslint = new ESLint({ cwd: `${import.meta.dir}/..` });

async function localRules(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(`${code}\n`, { filePath });
  const fatal = result.messages.find((message) => message.fatal);
  if (fatal) throw new Error(fatal.message);
  return result.messages.flatMap((message) => (message.ruleId?.startsWith('local/') ? [message.ruleId] : []));
}

const RULE = 'local/no-sync-spawn';
const CALLER = 'src/commands/entries/import/edit.ts';
const OWNER = 'src/lib/sync-child.ts';

describe('local/no-sync-spawn', () => {
  test('fires on the named import the editor used', async () => {
    expect(
      await localRules("import { spawnSync } from 'node:child_process';\nexport const run = spawnSync;", CALLER),
    ).toEqual([RULE]);
  });

  test('fires on a namespace import and on the sync names it keeps', async () => {
    expect(
      await localRules("import * as cp from 'node:child_process';\nexport const run = cp.execSync;", CALLER),
    ).toEqual([RULE, RULE]);
  });

  test('fires on execFileSync from child_process and on spawnSync from bun', async () => {
    expect(
      await localRules("import { execFileSync } from 'child_process';\nexport const run = execFileSync;", CALLER),
    ).toEqual([RULE]);
    expect(await localRules("import { spawnSync } from 'bun';\nexport const run = spawnSync;", CALLER)).toEqual([RULE]);
  });

  test('fires on Bun.spawnSync and on a destructured execSync', async () => {
    expect(await localRules("export const result = Bun.spawnSync(['true']);", CALLER)).toEqual([RULE]);
    expect(await localRules("const { execSync } = Bun;\nexport { execSync };", CALLER)).toEqual([RULE]);
  });

  test('allows async spawn, and allows the sync names only in the owner', async () => {
    expect(await localRules("import { spawnSync } from 'node:child_process';\nexport const run = spawnSync;", CALLER)).toEqual([
      RULE,
    ]);
    expect(await localRules("import { spawn } from 'node:child_process';\nexport const run = spawn;", CALLER)).toEqual([]);
    expect(await localRules("export const proc = Bun.spawn(['true']);", CALLER)).toEqual([]);
    expect(
      await localRules("import { spawnSync } from 'node:child_process';\nexport const run = spawnSync;", OWNER),
    ).toEqual([]);
  });
});
