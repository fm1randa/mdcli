import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PRIVATE_TERM_HASHES, termHash } from '../scripts/private-terms.js';
import { removedRunsBetween } from '../scripts/private-terms-corpus.js';

const TERM = 'termo-sintetico-removido';

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

function withRepo(base: string, head: string, callback: (root: string, base: string, head: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'mdcli-private-corpus-'));
  try {
    git(root, ['init', '-q']);
    writeFileSync(join(root, 'note.txt'), base);
    const baseCommit = commit(root, 'base');
    writeFileSync(join(root, 'note.txt'), head);
    const headCommit = commit(root, 'head');
    callback(root, baseCommit, headCommit);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('reports a removed term until the guard has its hash', () => {
  withRepo(`linha limpa\n${TERM}\n`, 'linha limpa\n', (root, base, head) => {
    const unguarded = removedRunsBetween(base, head, root, new Set());
    expect(unguarded.map((hit) => `${hit.file}:${hit.line}`)).toEqual(['note.txt:2']);

    expect(removedRunsBetween(base, head, root, new Set([termHash(TERM)]))).toEqual([]);
  });
});

test('ignores a word that another head line still carries', () => {
  withRepo('linha com palavra\ntermo removido\n', 'outra linha com palavra\n', (root, base, head) => {
    const hits = removedRunsBetween(base, head, root, new Set());
    expect(hits.map((hit) => hit.line)).toEqual([2]);
  });
});

test('an unguarded id next to a guarded name is still reported', () => {
  withRepo('nome permitido 12345\n', 'linha limpa\n', (root, base, head) => {
    const terms = new Set([termHash('nome permitido')]);
    const hits = removedRunsBetween(base, head, root, terms);
    expect(hits.map((hit) => hit.line)).toEqual([1]);

    const complete = new Set([...terms, termHash('12345')]);
    expect(removedRunsBetween(base, head, root, complete)).toEqual([]);
  });
});

test('skips a git object hash but still reports a removed word', () => {
  withRepo('readme blob\n0123456789abcdef0123456789abcdef01234567\ntermo removido\n', 'readme blob\n', (root, base, head) => {
    const hits = removedRunsBetween(base, head, root, new Set());
    expect(hits.map((hit) => hit.line)).toEqual([3]);
  });
});

test('the #177 migration leaves no removed term without a guard hash', () => {
  expect(removedRunsBetween('0cf33e5', '73dc226')).toEqual([]);
});

test('the migration check reports a guard hash removed from the set', () => {
  const omitted = '24d7f03d8dc3c3666969e6fa5bb1fac4736d3f1353c28307ed51b320f9dc42d3';
  expect(PRIVATE_TERM_HASHES.has(omitted)).toBe(true);
  const reduced = new Set([...PRIVATE_TERM_HASHES].filter((hash) => hash !== omitted));
  const hashes = removedRunsBetween('0cf33e5', '73dc226', undefined, reduced).map((hit) => hit.hash);
  expect(hashes).toContain(omitted);
});
