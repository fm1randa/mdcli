import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { git } from '../scripts/git.js';
import { classifyRisk, type RiskReport } from '../scripts/risk.js';
import { commitAll } from './git-repo.js';
import { run } from './run.js';

// The write functions used to be a hand-kept list in scripts/risk.ts that
// missed closeCardInvoice and reopenCardInvoice (#348). These tests go
// through the CLI, so they hold whatever way the surface is computed.

const root = join(import.meta.dir, '..');
const fixtures = join(import.meta.dir, 'fixtures', 'risk');
const riskScript = join(root, 'scripts', 'risk.ts');

async function risk(args: string[], cwd = root): Promise<{ code: number; report: RiskReport }> {
  const result = await run(['bun', riskScript, ...args], { cwd });
  return { code: result.exitCode, report: JSON.parse(result.stdout) as RiskReport };
}

function writeFiles(repo: string, files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    const target = join(repo, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

async function withRepo(files: Record<string, string>, body: (repo: string, rev: string) => Promise<void>): Promise<void> {
  const repo = mkdtempSync(join(tmpdir(), 'mdcli-write-surface-'));
  try {
    await git(['init', '-q'], repo);
    writeFiles(repo, files);
    await body(repo, await commitAll(repo, 'base'));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

const ARCHIVE_API = [
  "import { request } from './request.js';",
  '',
  'export async function fetchArchive(id: number): Promise<unknown> {',
  "  return request<unknown>('GET', `/v1/arquivo/${id}`);",
  '}',
  '',
  'export async function archiveThing(id: number): Promise<void> {',
  "  await request<Array<{ id: number }>>('POST', `/v1/arquivo/${id}`, {});",
  '}',
  '',
  'export const archiveTwice = async (id: number): Promise<void> => {',
  '  await archiveThing(id);',
  '  await archiveThing(id);',
  '};',
  '',
].join('\n');

function commandDiff(line: string): string {
  return [
    'diff --git a/src/commands/archive.ts b/src/commands/archive.ts',
    'index 1111111..2222222 100644',
    '--- a/src/commands/archive.ts',
    '+++ b/src/commands/archive.ts',
    '@@ -1,3 +1,3 @@',
    ' export async function run(id: number): Promise<void> {',
    `-  await ${line}(id);`,
    `+  await ${line}(id + 1);`,
    ' }',
    '',
  ].join('\n');
}

function writeDiffFile(repo: string, text: string): string {
  const path = join(repo, 'change.diff');
  writeFileSync(path, text);
  return path;
}

// Each shape reaches a write through a name the old line regex could not
// follow (#357). `write` and `read` are how src/commands/archive.ts calls the
// writer and the reader; the reader is the negative control for the shape.
interface SyntaxCase {
  shape: string;
  files: Record<string, string>;
  imports: string;
  write: string;
  read: string;
}

const SYNTAX_CASES: readonly SyntaxCase[] = [
  {
    shape: 'an import alias',
    files: { 'src/lib/api/archive.ts': ARCHIVE_API },
    imports: "import { archiveThing as persist, fetchArchive as load } from '../lib/api/archive.js';",
    write: 'persist',
    read: 'load',
  },
  {
    shape: 'a re-export alias',
    files: {
      'src/lib/api/archive.ts': ARCHIVE_API,
      'src/lib/api.ts': "export { archiveThing as stash, fetchArchive as peek } from './api/archive.js';\n",
    },
    imports: "import { stash, peek } from '../lib/api.js';",
    write: 'stash',
    read: 'peek',
  },
  {
    shape: 'an object method',
    files: {
      'src/lib/api/archive.ts': [
        "import { request } from './request.js';",
        'export const archive = {',
        "  close(id: number) { return request('POST', `/v1/arquivo/${id}`, {}); },",
        "  read(id: number) { return request('GET', `/v1/arquivo/${id}`); },",
        '};',
        '',
      ].join('\n'),
    },
    imports: "import { archive } from '../lib/api/archive.js';",
    write: 'archive.close',
    read: 'archive.read',
  },
  {
    shape: 'a class method',
    files: {
      'src/lib/api/archive.ts': [
        "import { request } from './request.js';",
        'export class Archiver {',
        "  async close(id: number): Promise<void> { await request('DELETE', `/v1/arquivo/${id}`); }",
        "  async read(id: number): Promise<unknown> { return request('GET', `/v1/arquivo/${id}`); }",
        '}',
        'export const archiver = new Archiver();',
        '',
      ].join('\n'),
    },
    imports: "import { archiver } from '../lib/api/archive.js';",
    write: 'archiver.close',
    read: 'archiver.read',
  },
  {
    shape: 'a method held in a constant',
    files: {
      'src/lib/api/archive.ts': [
        "import { request } from './request.js';",
        "const METHOD = 'PUT';",
        "const READ = 'GET';",
        'export function archiveThing(id: number) { return request(METHOD, `/v1/arquivo/${id}`, {}); }',
        'export function fetchArchive(id: number) { return request(READ, `/v1/arquivo/${id}`); }',
        '',
      ].join('\n'),
    },
    imports: "import { archiveThing, fetchArchive } from '../lib/api/archive.js';",
    write: 'archiveThing',
    read: 'fetchArchive',
  },
];

function commandFile(imports: string, call: string): string {
  return [imports, 'export async function run(id: number): Promise<void> {', `  await ${call}(id + 1);`, '}', ''].join('\n');
}

describe('risk write surface', () => {
  test('flags a changed closeCardInvoice target as a data write (#348)', async () => {
    const { code, report } = await risk(['--diff', join(fixtures, 'invoice-close-target.diff')]);
    expect(code).toBe(2);
    expect(report.reasons).toEqual([
      { topic: 'write', path: 'src/commands/cards-invoice-write.ts', detail: 'data write behavior changed' },
    ]);
  });

  test('treats a module that calls an API writer as a write module', async () => {
    const { code, report } = await risk(['--diff', join(fixtures, 'invoice-write-payload.diff')]);
    expect(code).toBe(2);
    expect(report.reasons).toEqual([
      { topic: 'write', path: 'src/commands/cards-invoice-write.ts', detail: 'unclassified change in a sensitive file' },
    ]);
  });

  test('derives a new API writer and its wrapper from the code, and leaves a reader out', async () => {
    await withRepo({ 'src/lib/api/archive.ts': ARCHIVE_API }, async (repo, rev) => {
      for (const writer of ['archiveThing', 'archiveTwice']) {
        const { code, report } = await risk(['--base', rev, '--diff', writeDiffFile(repo, commandDiff(writer))], repo);
        expect({ writer, code, topics: report.reasons.map((reason) => reason.topic) }).toEqual({
          writer,
          code: 2,
          topics: ['write'],
        });
      }
      // Positive control above, negative control here: the same file's GET
      // reader does not make its caller a write.
      const reader = await risk(['--base', rev, '--diff', writeDiffFile(repo, commandDiff('fetchArchive'))], repo);
      expect(reader).toEqual({ code: 0, report: { risky: false, reasons: [] } });
    });
  });

  test('keeps a writer the base had after the head removes it', async () => {
    await withRepo({ 'src/lib/api/archive.ts': ARCHIVE_API }, async (repo, rev) => {
      writeFiles(repo, { 'src/lib/api/archive.ts': 'export const value = 1;\n' });
      await commitAll(repo, 'drop the writer');
      const { code, report } = await risk(['--base', rev, '--diff', writeDiffFile(repo, commandDiff('archiveThing'))], repo);
      expect(code).toBe(2);
      expect(report.reasons.map((reason) => reason.topic)).toEqual(['write']);
    });
  });

  for (const { shape, files, imports, write, read } of SYNTAX_CASES) {
    test(`follows a writer reached through ${shape} (#357)`, async () => {
      const expectations: Array<{ call: string; code: number; topics: RiskReport['reasons'][number]['topic'][] }> = [
        { call: write, code: 2, topics: ['write'] },
        { call: read, code: 0, topics: [] },
      ];
      for (const expected of expectations) {
        await withRepo({ ...files, 'src/commands/archive.ts': commandFile(imports, expected.call) }, async (repo, rev) => {
          const { code, report } = await risk(['--base', rev, '--diff', writeDiffFile(repo, commandDiff(expected.call))], repo);
          expect({ call: expected.call, code, topics: report.reasons.map((reason) => reason.topic) }).toEqual(expected);
        });
      }
    });
  }

  test('treats a change in the write surface derivation as a security surface', () => {
    const diff = [
      'diff --git a/scripts/write-surface.ts b/scripts/write-surface.ts',
      'index 1111111..2222222 100644',
      '--- a/scripts/write-surface.ts',
      '+++ b/scripts/write-surface.ts',
      '@@ -1,1 +1,1 @@',
      "-const WRITE_LITERAL = /['\"`](?:POST|PUT|DELETE)['\"`]/;",
      "+const WRITE_LITERAL = /['\"`](?:POST)['\"`]/;",
      '',
    ].join('\n');
    expect(classifyRisk(diff).reasons).toEqual([
      { topic: 'security', path: 'scripts/write-surface.ts', detail: 'write surface the risk classifier derives changed' },
    ]);
  });
});
