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
    // src/types/api.ts is another module named api.
    expect(await hits("export * from './api.js';\n", 'src/types/index.ts')).toEqual([]);
  });

  test('passes the client\'s own imports, where the same imports fail outside it', async () => {
    const owner = "import { apiPost, request } from './request.js';\nexport const save = (body: unknown) => apiPost('/v1/x', body);\n";
    expect(await hits(owner, 'src/lib/api/savings-goals.ts')).toEqual([]);
    expect(await hits(owner.replace('./request.js', './api/request.js'), 'src/lib/savings-goals.ts')).toEqual([1, 1]);
  });
});

async function leaks(code: string, filePath: string): Promise<number[]> {
  const [result] = await eslint.lintText(code, { filePath });
  const fatal = result.messages.find((m) => m.fatal);
  if (fatal) throw new Error(fatal.message);
  return result.messages.flatMap((m) => (m.ruleId === 'no-restricted-syntax' ? [m.line] : []));
}

const CLIENT_FILES = [
  'src/lib/api.ts',
  ...[...new Bun.Glob('src/lib/api/*.ts').scanSync(ROOT)].filter((path) => path !== 'src/lib/api/request.ts').sort(),
];

describe('a raw API writer handed out of the client (#358)', () => {
  test(`fails lint on the copy src/lib/api.ts carried at ${BEFORE}`, async () => {
    const path = 'src/lib/api.ts';
    const old = await git(['show', `${BEFORE}:${path}`], ROOT);
    expect(old).toContain("export { apiGet, apiPost } from './api/request.js';");
    expect(await leaks(old, path)).toEqual([5]);
  });

  test('fails the mutation #358 names: a resource module reexporting apiPost, alias or not', async () => {
    const path = 'src/lib/api/savings-goals.ts';
    const current = await Bun.file(`${ROOT}/${path}`).text();
    const lines = current.split('\n').length;
    expect(await leaks(`${current}export { apiPost } from './request.js';\n`, path)).toEqual([lines]);
    expect(await leaks(`${current}export { apiPost as postIt } from './request.js';\n`, path)).toEqual([lines]);
  });

  test('names the fix in its message', async () => {
    const [result] = await eslint.lintText("export { request } from './request.js';\n", { filePath: 'src/lib/api/cards.ts' });
    const message = result.messages.find((m) => m.ruleId === 'no-restricted-syntax')?.message;
    expect(message).toContain('add a named function for the endpoint to the resource module in src/lib/api/');
  });

  test('fails every syntactic way to pass a writer on', async () => {
    const path = 'src/lib/api/budget.ts';
    const imported = "import { apiPost, apiPut, apiDelete, request } from './request.js';\n";
    const variants: [string, string][] = [
      ['local reexport', 'export { apiPut };'],
      ['local alias', 'export { apiDelete as remove };'],
      ['default export', 'export default request;'],
      ['object', 'export const writers = { apiPost };'],
      ['object property', 'export const writers = { post: apiPost };'],
      ['class field', 'export class Writers { static post = apiPost; }'],
      ['variable', 'export const post = apiPost;'],
      ['argument', 'export const all = [apiPost].map((writer) => writer);'],
      ['member read', 'export const bound = apiPost.bind(null);'],
    ];
    for (const [name, line] of variants) {
      expect({ name, lines: await leaks(imported + line, path) }).toEqual({ name, lines: [2] });
    }
    expect(await leaks("import { apiPost as postIt } from './request.js';\n", path)).toEqual([1]);
    expect(await leaks("export * from './request.js';\n", path)).toEqual([1]);
    expect(await leaks("export * from './api/request.js';\n", 'src/lib/api.ts')).toEqual([1]);
    expect(await leaks("import * as raw from './request.js';\nexport const post = raw.apiPost;\n", path)).toEqual([1]);
    expect(await leaks("import * as raw from './request.ts';\n", path)).toEqual([1]);
    expect(await leaks("import core, * as raw from './request.js';\nexport const post = raw.apiPost;\n", path)).toEqual([1]);
  });

  test('fails a local binding that shadows a writer name, with its own message', async () => {
    const path = 'src/lib/api/budget.ts';
    const shadows = [
      'export const url = (request: { url: string }) => request.url;',
      'export function f(apiPost = 1) { return apiPost; }',
      'const apiPut = 1;',
      'try { f(); } catch (request) { void request; }',
    ];
    for (const code of shadows) {
      const [result] = await eslint.lintText(code, { filePath: path });
      const renames = result.messages.filter((m) => m.ruleId === 'no-restricted-syntax' && m.message.startsWith('Rename this binding'));
      expect({ code, renames: renames.length }).toEqual({ code, renames: 1 });
    }
  });

  test('passes calls, keys and type queries of the same names, and request.ts itself', async () => {
    const path = 'src/lib/api/budget.ts';
    const uses = [
      "import { apiPost, request } from './request.js';",
      "export const save = (body: unknown) => apiPost('/v1/x', body);",
      "export const read = () => request<number>('GET', '/v1/x');",
      'export const shape = { request: 1, apiPost: 2 };',
      'export const field = shape.request;',
      'export type Request = typeof request;',
    ].join('\n');
    expect(await leaks(uses, path)).toEqual([]);
    expect(await leaks("export * from './budget.js';\nexport { apiGet } from './api/request.js';\n", 'src/lib/api.ts')).toEqual([]);
    const owner = await Bun.file(`${ROOT}/src/lib/api/request.ts`).text();
    expect(owner).toContain('export const apiPost');
    expect(await leaks(`${owner}export { apiPost as postIt };\n`, 'src/lib/api/request.ts')).toEqual([]);
  });

  test('passes every client module as it stands', async () => {
    expect(CLIENT_FILES).toContain('src/lib/api/budget.ts');
    for (const path of CLIENT_FILES) {
      const code = await Bun.file(`${ROOT}/${path}`).text();
      expect({ path, lines: await leaks(code, path) }).toEqual({ path, lines: [] });
    }
  });
});
