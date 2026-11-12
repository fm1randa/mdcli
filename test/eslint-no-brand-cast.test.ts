import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { ESLint } from 'eslint';
import { git } from '../scripts/git.js';

const ROOT = `${import.meta.dir}/..`;
const eslint = new ESLint({ cwd: ROOT });
const RULE = 'local/no-brand-cast';
const OWNER = 'src/lib/entry-id-brands.ts';
const AREAS = ['src/lib/normalize.ts', 'test/import-harness.ts', 'scripts/risk.ts'];

// Typed linting builds each area's program on its first lintText call; under
// the parallel run that took 24 s inside the first test (#279). Build them first.
for (const area of AREAS) await eslint.lintText('export const answer = 42;\n', { filePath: area });

async function hits(code: string, filePath: string, rule = RULE): Promise<number[]> {
  const [result] = await eslint.lintText(`${code}\n`, { filePath });
  const fatal = result.messages.find((m) => m.fatal);
  if (fatal) throw new Error(fatal.message);
  return result.messages.flatMap((m) => (m.ruleId === rule ? [m.line] : []));
}

/** The import of `names` from a repository module, as a file at `area` spells it. */
function importFrom(area: string, module: string, names: string, type = true): string {
  const path = relative(dirname(area), module).replace(/\.ts$/, '.js');
  return `import ${type ? 'type ' : ''}{ ${names} } from '${path.startsWith('.') ? path : `./${path}`}';\n`;
}

const TYPES = "import type { EntryId, EntryIdText, OccurrenceId } from '../src/types/index.js';\n";

const FORMS: Record<string, string> = {
  'as EntryId': 'export const v = 1 as EntryId;',
  'as EntryIdText': "export const v = '1' as EntryIdText;",
  'as OccurrenceId': "export const v = 'x' as OccurrenceId;",
  'angle-bracket assertion': 'export const v = <EntryId>1;',
  'brand inside a union': 'export const v = 1 as EntryId | EntryIdText;',
  'brand inside an array': 'export const v = [1] as EntryId[];',
  'brand inside a generic': "export const v = ['x'] as Array<OccurrenceId>;",
  'brand inside an object type': 'export const v = { id: 1 } as { id: EntryId };',
  'qualified name': "import type * as T from '../src/types/index.js';\nexport const v = 1 as T.EntryId;",
  'renamed import': "import type { EntryId as Id } from '../src/types/index.js';\nexport const v = 1 as Id;",
  'type predicate': 'export const isId = (v: number): v is EntryId => v > 0;',
  'local type alias': 'type Id = EntryId;\ntype Ids = Id[];\nexport const v = [1] as Ids;',
  'local interface': 'interface Created { id: OccurrenceId }\nexport const v = { id: 1 } as Created;',
  'type declared after the cast': 'export const v = 1 as Later;\ntype Later = EntryIdText | null;',
};

const CAST_LINE: Record<string, number> = { 'type declared after the cast': 2 };

// Spellings that resolve to a brand without naming it (#290): only the type
// checker sees them, so each probe imports from its own area.
const RESOLVED_FORMS: Record<string, (area: string) => string> = {
  'typeof a branded value': (area) =>
    `${importFrom(area, 'src/types/index.ts', 'EntryId')}declare const ref: EntryId;\nexport const v = 5 as typeof ref;`,
  'a type computed from a constructor': (area) =>
    `${importFrom(area, 'src/lib/entry-id-brands.ts', 'asEntryId', false)}export const v = 5 as NonNullable<ReturnType<typeof asEntryId>>;`,
  'a type from another file that carries the brand': (area) =>
    `${importFrom(area, 'src/commands/entries/entry-id.ts', 'ResolvedCreateEntry')}export const v = JSON.parse('{}') as ResolvedCreateEntry;`,
  'the brand deep in an object': (area) =>
    `${importFrom(area, 'src/types/index.ts', 'OccurrenceId')}declare const ref: OccurrenceId;\nexport const v = { x: [{ id: 'y' }] } as { x: { id: typeof ref }[] };`,
};

const UNSAFE_AREAS = ['src/lib/normalize.ts', 'bin/cli.ts', 'scripts/risk.ts'];

// main when #277 was filed: the casts the issue lists, by line, plus the
// `id is OccurrenceId` predicate at entry-id.ts:30 that branded the same way.
const BEFORE = '110719d';
const CASTS: Record<string, number[]> = {
  'src/commands/entries/entry-id.ts': [18, 21, 30, 84, 89, 91, 91, 93],
  'scripts/mock-entry-payload.ts': [84, 87],
};

describe('local/no-brand-cast', () => {
  for (const [form, code] of Object.entries(FORMS)) {
    test(`fires on ${form} in src, test and scripts`, async () => {
      const source = code.startsWith('import') ? code : `${TYPES}${code}`;
      const line = CAST_LINE[form] ?? source.split('\n').length;
      for (const area of AREAS) expect(await hits(source, area)).toEqual([line]);
    });
  }

  for (const [form, code] of Object.entries(RESOLVED_FORMS)) {
    test(`fires on ${form} in src, test and scripts`, async () => {
      for (const area of AREAS) {
        const source = code(area);
        expect(await hits(source, area)).toEqual([source.split('\n').length]);
      }
    });
  }

  test('does not fire on a cast whose operand already carries the brand, or on the raw API answer', async () => {
    for (const area of AREAS) {
      const kept = `${importFrom(area, 'src/types/index.ts', 'EntryId')}declare const ref: EntryId;\nexport const v = { id: ref } as { id: typeof ref; n?: number };`;
      expect(await hits(kept, area)).toEqual([]);
      const raw = `${importFrom(area, 'src/types/index.ts', 'CreateEntryResponse')}export const v = JSON.parse('{}') as CreateEntryResponse;`;
      expect(await hits(raw, area)).toEqual([]);
    }
  });

  test('an `any` assigned to a branded slot fails no-unsafe-assignment in src, bin and scripts', async () => {
    for (const area of UNSAFE_AREAS) {
      const source = `${importFrom(area, 'src/types/index.ts', 'EntryId')}export const v: EntryId = JSON.parse('1');`;
      expect(await hits(source, area, '@typescript-eslint/no-unsafe-assignment')).toEqual([2]);
    }
  });

  test('does not fire in the constructors module or on casts to other types', async () => {
    expect(await hits(`${TYPES}${FORMS['as EntryId']}`, OWNER)).toEqual([]);
    expect(await hits(`${TYPES}${FORMS['type predicate']}`, OWNER)).toEqual([]);
    expect(await hits("type EntryIdRead = { entry: number };\nexport const v = {} as EntryIdRead;", AREAS[0])).toEqual([]);
    expect(await hits('export const v = 1 as number;', AREAS[0])).toEqual([]);
    expect(await hits('type Plain = { id: number };\nexport const v = {} as Plain;', AREAS[0])).toEqual([]);
  });

  test(`catches every cast main carried at ${BEFORE}, and the branch carries none`, async () => {
    for (const [file, lines] of Object.entries(CASTS)) {
      expect(await hits(git(['show', `${BEFORE}:${file}`], ROOT), file)).toEqual(lines);
      expect(await hits(readFileSync(`${ROOT}/${file}`, 'utf8'), file)).toEqual([]);
    }
  });
});
