import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PRIVATE_TERM_HASHES, termHash } from '../scripts/private-terms.js';
import { guardChanged, removedRunsBetween } from '../scripts/private-terms-corpus.js';

const TERM = 'Conta Removida';

function git(cwd: string, args: string[]): string {
  const result = Bun.spawnSync(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString();
}

function commit(cwd: string, message: string): string {
  git(cwd, ['add', '-A']);
  git(cwd, ['-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-q', '-m', message]);
  return git(cwd, ['rev-parse', 'HEAD']).trim();
}

function initRepo(root: string): void {
  git(root, ['init', '-q']);
}

function withRepo(base: string, head: string, callback: (root: string, base: string, head: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'mdcli-private-corpus-'));
  try {
    initRepo(root);
    writeFileSync(join(root, 'note.txt'), base);
    const baseCommit = commit(root, 'base');
    writeFileSync(join(root, 'note.txt'), head);
    const headCommit = commit(root, 'head');
    callback(root, baseCommit, headCommit);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** A shallow clone cannot replay the #177 migration; skip instead of failing. */
function hasHistory(): boolean {
  return ['0cf33e5', '73dc226'].every(
    (rev) => Bun.spawnSync(['git', 'cat-file', '-e', `${rev}^{commit}`], { cwd: process.cwd() }).exitCode === 0
  );
}

const replay = hasHistory() ? test : test.skip;

test('reports a removed value until the guard has its hash', () => {
  withRepo(`linha limpa\n'${TERM}'\n`, 'linha limpa\n', (root, base, head) => {
    const unguarded = removedRunsBetween(base, head, root, new Set());
    expect(unguarded.map((hit) => `${hit.file}:${hit.line}:${hit.hash}`)).toEqual([
      `note.txt:2:${termHash(TERM)}`,
    ]);

    expect(removedRunsBetween(base, head, root, new Set([termHash(TERM)]))).toEqual([]);
  });
});

test('reports a phrase whose words survive separately in the head', () => {
  withRepo('Conta Alfa\nBeta Gama\nAlfa Beta\n', 'Conta Alfa\nBeta Gama\n', (root, base, head) => {
    const hits = removedRunsBetween(base, head, root, new Set());
    expect(hits.map((hit) => `${hit.file}:${hit.line}:${hit.hash}`)).toEqual([
      `note.txt:3:${termHash('Alfa Beta')}`,
    ]);
  });
});

test('an unguarded id next to a guarded name is still reported', () => {
  withRepo('nome permitido 12345\n', 'linha limpa\n', (root, base, head) => {
    const terms = new Set([termHash('nome permitido')]);
    const hits = removedRunsBetween(base, head, root, terms);
    expect(hits.map((hit) => `${hit.file}:${hit.line}:${hit.hash}`)).toEqual([
      `note.txt:1:${termHash('12345')}`,
    ]);

    const complete = new Set([...terms, termHash('12345')]);
    expect(removedRunsBetween(base, head, root, complete)).toEqual([]);
  });
});

test('skips a git object hash but still reports a removed value', () => {
  const objectId = '0123456789abcdef0123456789abcdef01234567';
  withRepo(`readme blob\n${objectId}\n'${TERM}'\n`, 'readme blob\n', (root, base, head) => {
    const hits = removedRunsBetween(base, head, root, new Set());
    expect(hits.map((hit) => `${hit.file}:${hit.line}`)).toEqual(['note.txt:3']);
  });
});

test('ignores the abbreviated base SHA in the README line', () => {
  const base =
    '<!-- translated from README.md @ a699eaa (base: a699eaa6ee878976f58680a59345d23ccdb27094; readme-blob: 96bf6ee6b2e1dfcf406c288fa624a7af29b452e1); update the SHA and readme-blob -->\n';
  const head =
    '<!-- translated from README.md @ f4d3274 (base: f4d32748b04faac2fdfa01270c0cfc948089f0b4; readme-blob: 939d52cc30f6c70df063b52b02ebf06c92beb27d); update the SHA and readme-blob -->\n';
  withRepo(base, head, (root, baseCommit, headCommit) => {
    expect(removedRunsBetween(baseCommit, headCommit, root, new Set())).toEqual([]);
  });
});

test('skips a code identifier rename', () => {
  const base = 'export function oldUniqueName() {\n  return 1;\n}\n';
  const head = 'export function newUniqueName() {\n  return 1;\n}\n';
  withRepo(base, head, (root, baseCommit, headCommit) => {
    expect(removedRunsBetween(baseCommit, headCommit, root, new Set())).toEqual([]);
  });
});

replay('the #177 migration leaves no removed term without a guard hash', () => {
  expect(removedRunsBetween('0cf33e5', '73dc226')).toEqual([]);
});

replay('the migration check reports a guard hash removed from the set', () => {
  const omitted = 'c6f0c3cf2b9f61109a022215d9f9e2e1618c6415bbc99bce799a23e2375cf9b3';
  expect(PRIVATE_TERM_HASHES.has(omitted)).toBe(true);
  const reduced = new Set([...PRIVATE_TERM_HASHES].filter((hash) => hash !== omitted));
  const hashes = removedRunsBetween('0cf33e5', '73dc226', undefined, reduced).map((hit) => hit.hash);
  expect(hashes).toContain(omitted);
});

test('requires the corpus only when the private-data guard changes', () => {
  const root = mkdtempSync(join(tmpdir(), 'mdcli-private-scope-'));
  try {
    initRepo(root);
    mkdirSync(join(root, 'scripts'), { recursive: true });
    writeFileSync(join(root, 'scripts/private-terms.ts'), 'export const guard = 1;\n');
    writeFileSync(join(root, 'note.txt'), 'one\n');
    const base = commit(root, 'base');
    writeFileSync(join(root, 'note.txt'), 'two\n');
    const head = commit(root, 'head');
    expect(guardChanged(base, head, root)).toBe(false);

    writeFileSync(join(root, 'scripts/private-terms.ts'), 'export const guard = 2;\n');
    const guardHead = commit(root, 'guard');
    expect(guardChanged(head, guardHead, root)).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
