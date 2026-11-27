import { describe, expect, test } from 'bun:test';
import { ESLint } from 'eslint';
import { git } from '../scripts/git.js';

// Lints with the repo's real eslint.config.js; the paths must be files of the
// TS project, since lintText lints the given text in place of the file.
const ROOT = `${import.meta.dir}/..`;
const eslint = new ESLint({ cwd: ROOT });
await eslint.lintText('export const answer = 42;\n', { filePath: 'src/lib/normalize.ts' });

const RULE = 'local/no-unchecked-parse';
const PROBE_FILE = 'src/lib/normalize.ts';

async function lines(code: string, filePath: string, rule = RULE): Promise<number[]> {
  const [result] = await eslint.lintText(code, { filePath });
  const fatal = result.messages.find((m) => m.fatal);
  if (fatal) throw new Error(fatal.message);
  return result.messages.flatMap((m) => (m.ruleId === rule ? [m.line] : []));
}

/** One probe per line: the line numbers the rule reports. */
async function probe(...code: string[]): Promise<number[]> {
  const header = 'declare const raw: string;\ndeclare function get(endpoint: string): Promise<unknown>;\ndeclare const res: Response;\ndeclare const db: { get(key: string): unknown };\n';
  return (await lines(`${header}${code.join('\n')}\n`, PROBE_FILE)).map((line) => line - 4);
}

// main when #362 was filed: every read below cast what it parsed.
const BEFORE = 'da780e1';

describe('local/no-unchecked-parse', () => {
  test(`fails lint on the boundary reads src/ carried at ${BEFORE}`, async () => {
    const old = async (path: string) => lines(await git(['show', `${BEFORE}:${path}`], ROOT), path);
    expect(await old('src/lib/config.ts')).toEqual([56]);
    expect(await old('src/lib/self-update.ts')).toEqual([41, 77, 92, 107]);
    expect(await old('src/lib/account-balances.ts')).toEqual([62]);
    expect(await old('src/lib/onepassword.ts')).toEqual([23]);
    expect(await old('src/lib/browser-session/jwt.ts')).toEqual([10]);
    expect(await old('src/lib/browser-session/chromium.ts')).toEqual([30]);
  });

  test('fails the probe and every way of writing the same cast', async () => {
    expect(await probe(
      'export const a = JSON.parse(raw) as { id: number };',
      'export const b = (JSON.parse(raw)) as { id: number };',
      'export const c = <{ id: number }>JSON.parse(raw);',
      'export const d = JSON.parse(raw) satisfies { id: number };',
      'export const e = JSON.parse(raw) as unknown as { id: number };',
      'export const f = globalThis.JSON.parse(raw) as { id: number };',
      "export const g = JSON['parse'](raw) as { id: number };",
      "export const h = (await get('/v1/x')) as { id: number };",
      "export const i = get('/v1/x') as Promise<{ id: number }>;",
      "export const j = db.get('k') as { id: number };",
      'export const k = (await res.json()) as { id: number };',
      "export const l = (await get('/v1/x'))! as { id: number };",
      "export const m = db.get?.('k') as { id: number };",
    )).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });

  test('passes a read kept as unknown and narrowed, and other casts', async () => {
    expect(await probe(
      'export const a: unknown = JSON.parse(raw);',
      'export const b = JSON.parse(raw) as unknown;',
      "export const c = (await get('/v1/x')) satisfies unknown;",
      'export const d = String(JSON.parse(raw));',
      "export const e = ({ id: 1 } as { id: number }).id;",
      "export const f = raw.split(',') as [string, string];",
      'export const g = JSON.stringify(raw) as string;',
    )).toEqual([]);
  });

  test('names the fix in its message', async () => {
    const [result] = await eslint.lintText('declare const raw: string;\nexport const a = JSON.parse(raw) as { id: number };\n', { filePath: PROBE_FILE });
    const message = result.messages.find((m) => m.ruleId === RULE)?.message;
    expect(message).toContain('Do not cast what JSON.parse(...) returns: `as` checks nothing at runtime.');
    expect(message).toContain('narrow it field by field with the readers in src/lib/payload.ts');
  });

  test('also fails a cast that changes nothing, as on the i18n catalog loader', async () => {
    const path = 'src/lib/i18n/index.ts';
    const old = await git(['show', `${BEFORE}:${path}`], ROOT);
    expect(old).toContain('return CATALOGS[language] as Catalog;');
    expect(await lines(old, path, '@typescript-eslint/no-unnecessary-type-assertion')).toEqual([28]);
  });
});
