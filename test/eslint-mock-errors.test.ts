import { describe, expect, test } from 'bun:test';
import { ESLint } from 'eslint';
import { git } from '../scripts/git.js';

const ROOT = `${import.meta.dir}/..`;
const eslint = new ESLint({ cwd: ROOT });

async function hits(code: string, filePath: string): Promise<number[]> {
  const [result] = await eslint.lintText(code, { filePath });
  const fatal = result.messages.find((m) => m.fatal);
  if (fatal) throw new Error(fatal.message);
  return result.messages.flatMap((m) => (m.ruleId === 'no-restricted-syntax' ? [m.line] : []));
}

// main when #286 was filed: mock-http.ts already owned notFound() and
// badRequest() (#276), and these routes still wrote their own 4xx.
const BEFORE = 'f41a669';
const COPIES: Record<string, number[]> = {
  'scripts/mock-cards.ts': [67, 77, 89],
  'scripts/mock-connections.ts': [42, 58],
  'scripts/mock-import.ts': [90],
  'scripts/mock-api.ts': [140],
};

describe('a mock route answering a 4xx by hand', () => {
  for (const [path, lines] of Object.entries(COPIES)) {
    test(`fails lint on every copy ${path} carried at ${BEFORE}`, async () => {
      expect(await hits(git(['show', `${BEFORE}:${path}`], ROOT), path)).toEqual(lines);
    });
  }

  test('passes in the owner and on a 2xx or 5xx answer, and fails a 4xx through json()', async () => {
    const owner = git(['show', `${BEFORE}:scripts/mock-http.ts`], ROOT);
    expect(owner).toContain("Response.json({ message: 'not found' }, { status: 404 })");
    expect(await hits(owner, 'scripts/mock-http.ts')).toEqual([]);
    const route = [
      'export const created = Response.json({ id: 1 }, { status: 201 });',
      "export const broken = new Response('boom', { status: 500 });",
      "export const gone = new Response('gone', { status: 410 });",
      "import { json } from './mock-http.js';",
      'export const typedOk = json({ id: 1 }, 201);',
      "export const typedMissing = json({ message: 'not found' }, 404);",
    ].join('\n');
    expect(await hits(route, 'scripts/mock-cards.ts')).toEqual([3, 6]);
  });
});
