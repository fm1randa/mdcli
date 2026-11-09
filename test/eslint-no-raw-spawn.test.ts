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

const GATE = 'scripts/risk.ts';
const OWNER = 'scripts/git.ts';
const RULE = 'local/no-raw-spawn';

describe('local/no-raw-spawn', () => {
  test('fires on Bun.spawnSync and Bun.spawn in a gate, as the old wrappers wrote them', async () => {
    // The shape every gate copied before #260 (replay-gates, risk, prova, private-terms).
    const wrapper = "export function git(args: string[], root: string): string {\n  const result = Bun.spawnSync(['git', ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' });\n  return result.stdout.toString();\n}";
    // A raw git spawn is also a git copy (#268), so both owners' rules report it.
    expect(await localRules(wrapper, GATE)).toEqual([RULE, 'local/no-git-copy']);
    expect(await localRules("export const proc = Bun.spawn(['gh', 'pr', 'view']);", GATE)).toEqual([RULE]);
    expect(await localRules("export const run = Bun['spawnSync'];", GATE)).toEqual([RULE]);
  });

  test('fires on child_process and the Bun shell in a gate', async () => {
    expect(await localRules("import { execFileSync } from 'node:child_process';\nexport const run = execFileSync;", GATE)).toEqual([RULE]);
    expect(await localRules("import { spawnSync } from 'child_process';\nexport const run = spawnSync;", GATE)).toEqual([RULE]);
    expect(await localRules("import { $ } from 'bun';\nexport const run = $;", GATE)).toEqual([RULE]);
    expect(await localRules("export const load = () => import('node:child_process');", GATE)).toEqual([RULE]);
  });

  // Each form passed the rule before #272, linted with the real config in scripts/.
  test('fires on Bun.$, the Bun shell reached through the global', async () => {
    expect(await localRules("export const out = await Bun.$`gh pr view`.text();", GATE)).toEqual([RULE]);
  });

  test('fires on a spawner destructured from Bun', async () => {
    expect(await localRules("const { spawnSync } = Bun;\nexport const run = spawnSync;", GATE)).toEqual([RULE]);
    expect(await localRules("const { spawn: launch } = globalThis.Bun;\nexport const run = launch;", GATE)).toEqual([RULE]);
  });

  test('fires on globalThis.Bun.spawnSync', async () => {
    expect(await localRules("export const result = globalThis.Bun.spawnSync(['gh', 'auth', 'status']);", GATE)).toEqual([RULE]);
  });

  test('fires on a spawner imported by name from "bun"', async () => {
    expect(await localRules("import { spawn } from 'bun';\nexport const run = spawn;", GATE)).toEqual([RULE]);
    expect(await localRules("import { spawnSync as run } from 'bun';\nexport { run };", GATE)).toEqual([RULE]);
  });

  test('fires on a spawner read from a namespace or default import of "bun"', async () => {
    expect(await localRules("import * as B from 'bun';\nexport const proc = B.spawn(['gh', 'pr', 'view']);", GATE)).toEqual([RULE]);
    expect(await localRules("import B from 'bun';\nexport const proc = B.spawnSync(['gh', 'pr', 'view']);", GATE)).toEqual([RULE]);
  });

  test('does not fire in the owner, or on another Bun API or spawn name in a gate', async () => {
    expect(await localRules("export const result = Bun.spawnSync(['git', 'status']);", OWNER)).toEqual([]);
    expect(await localRules("export const result = globalThis.Bun.spawnSync(['git', 'status']);", OWNER)).toEqual([]);
    expect(await localRules("export const file = Bun.file('package.json');", GATE)).toEqual([]);
    expect(await localRules("const { file } = Bun;\nexport const pkg = file('package.json');", GATE)).toEqual([]);
    expect(await localRules("import * as B from 'bun';\nexport const pkg = B.file('package.json');", GATE)).toEqual([]);
    expect(await localRules("import { file } from 'bun';\nexport const pkg = file('package.json');", GATE)).toEqual([]);
    expect(await localRules("import { spawn } from './git.js';\nexport const result = spawn(['gh', 'auth', 'status']);", GATE)).toEqual([]);
  });
});
