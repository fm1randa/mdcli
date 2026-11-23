import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { ESLint } from 'eslint';
import { git } from '../scripts/git.js';

const ROOT = `${import.meta.dir}/..`;
const eslint = new ESLint({ cwd: ROOT });
const RULE = 'local/no-host-literal';
const OWNER = 'src/lib/meu-dinheiro-host.ts';
const AREAS = ['src/lib/normalize.ts', 'scripts/risk.ts', 'bin/cli.ts'];

// Typed linting builds each area's program on its first lintText call, which
// takes longer than a test's timeout: build them before the tests run.
for (const area of AREAS) await eslint.lintText('export const answer = 42;\n', { filePath: area });

async function hits(code: string, filePath: string): Promise<number[]> {
  const [result] = await eslint.lintText(`${code}\n`, { filePath });
  const fatal = result.messages.find((m) => m.fatal);
  if (fatal) throw new Error(fatal.message);
  return result.messages.flatMap((m) => (m.ruleId === RULE ? [m.line] : []));
}

const FORMS: Record<string, string> = {
  'a URL string': "export const u = 'https://app.meudinheiroweb.com.br/';",
  'a host pattern': "export const p = 'app.meudinheiroweb.com.br/api/';",
  'a cookie domain': "export const d = '.meudinheiroweb.com.br';",
  'a template literal': 'declare const id: number;\nexport const u = `https://app.meudinheiroweb.com.br/u/${id}`;',
  'an uppercase host': "export const u = 'https://APP.MEUDINHEIROWEB.COM.BR/';",
};

// main when #279 was filed: every copy of the host the issue lists, by line.
const BEFORE = 'f41a669';
const COPIES: Record<string, number[]> = {
  'src/lib/api.ts': [16, 103, 104],
  'src/lib/browser-auth.ts': [7, 8],
  'src/lib/browser-session/jwt.ts': [1],
  'src/lib/browser-session/index.ts': [104, 140, 151],
};

describe('local/no-host-literal', () => {
  for (const [form, code] of Object.entries(FORMS)) {
    test(`fires on ${form} in src, scripts and bin`, async () => {
      const line = code.split('\n').length;
      for (const area of AREAS) expect(await hits(code, area)).toEqual([line]);
    });
  }

  test('does not fire in the owner, the help catalogs, comments or other hosts', async () => {
    expect(await hits(FORMS['a URL string'], OWNER)).toEqual([]);
    expect(await hits("export const s = 'Meu Dinheiro (meudinheiroweb.com.br)';", 'src/lib/i18n/catalog/en/common.ts')).toEqual([]);
    expect(await hits("// cdn.meudinheiroweb.com.br/js/mdb.js\nexport const n = 1;", AREAS[0])).toEqual([]);
    expect(await hits("export const u = 'https://example.test/api';", AREAS[0])).toEqual([]);
  });

  test(`catches every copy main carried at ${BEFORE}, and the branch carries none`, async () => {
    for (const [file, lines] of Object.entries(COPIES)) {
      expect(await hits(await git(['show', `${BEFORE}:${file}`], ROOT), file)).toEqual(lines);
      expect(await hits(readFileSync(`${ROOT}/${file}`, 'utf8'), file)).toEqual([]);
    }
  });
});
