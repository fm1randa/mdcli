import { describe, expect, test } from 'bun:test';
import { ESLint } from 'eslint';
import { git } from '../scripts/git.js';

const ROOT = `${import.meta.dir}/..`;
const eslint = new ESLint({ cwd: ROOT });

async function hits(code: string, filePath: string): Promise<number[]> {
  const [result] = await eslint.lintText(code, { filePath });
  const fatal = result.messages.find((m) => m.fatal);
  if (fatal) throw new Error(fatal.message);
  return result.messages.flatMap((m) => (m.ruleId === 'no-restricted-imports' ? [m.line] : []));
}

// main when #354 was filed: budget-write.ts posted the budget goals itself.
const BEFORE = '2891978';

describe('an API write outside src/lib/api', () => {
  test(`fails lint on the copy src/commands/budget-write.ts carried at ${BEFORE}`, async () => {
    const path = 'src/commands/budget-write.ts';
    const old = await git(['show', `${BEFORE}:${path}`], ROOT);
    expect(old).toContain("import { fetchCategories, apiPost } from '../lib/api.js';");
    expect(await hits(old, path)).toEqual([9]);
  });

  test('names the fix in its message', async () => {
    const [result] = await eslint.lintText("import { apiPost } from '../lib/api.js';\n", { filePath: 'src/commands/budget-write.ts' });
    const message = result.messages.find((m) => m.ruleId === 'no-restricted-imports')?.message;
    expect(message).toContain('add a named function for the endpoint to its resource module there');
  });

  test('fails every write import outside the client and passes reads and named writers', async () => {
    const command = [
      "import { apiGet, saveBudgetGoals } from '../lib/api.js';",
      "import { apiPost as post } from '../lib/api.js';",
      "import { request } from '../lib/api/request.js';",
      "export { apiDelete } from '../lib/api.js';",
      "import { apiPut } from '../lib/api';",
    ].join('\n');
    expect(await hits(command, 'src/commands/budget-write.ts')).toEqual([2, 3, 4, 5]);
    const lib = ["import { fetchSavingsGoals } from './api.js';", "import { apiPost } from './api/request.js';"].join('\n');
    expect(await hits(lib, 'src/lib/savings-goals.ts')).toEqual([2]);
    expect(await hits("import { apiPost } from '../src/lib/api.js';\n", 'bin/cli.ts')).toEqual([1]);
    expect(await hits("export * from './api.js';\n", 'src/lib/savings-goals.ts')).toEqual([1]);
  });

  test('passes on another module named api outside src/lib', async () => {
    expect(await hits("export * from './api.js';\n", 'src/types/index.ts')).toEqual([]);
  });

  test('passes inside the API client', async () => {
    const owner = "import { apiPost, request } from './request.js';\nexport { apiPost, request };\n";
    expect(await hits(owner, 'src/lib/api/budget.ts')).toEqual([]);
    expect(await hits("export { apiGet, apiPost } from './api/request.js';\n", 'src/lib/api.ts')).toEqual([]);
  });
});
