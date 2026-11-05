import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findPrivateTerms, scanText, scanTrackedFiles, termHash } from '../scripts/private-terms.js';

const fakeTerm = 'termo-sintetico-proibido';
const fakeHashes = new Set([termHash(fakeTerm)]);

test('finds a guarded term and passes without it', () => {
  expect(scanText(`linha limpa\n${fakeTerm} aqui\n`, fakeHashes)).toEqual([2]);
  expect(scanText('linha limpa\noutra linha limpa\n', fakeHashes)).toEqual([]);
});

test('an allowed phrase covers the word it contains', () => {
  const terms = new Set([termHash('termo permitido')]);
  const allowed = new Set([termHash('termo permitido de teste')]);

  expect(findPrivateTerms('termo permitido de teste', terms, allowed)).toEqual([]);
  expect(findPrivateTerms('termo permitido', terms, allowed)).toHaveLength(1);
});

test('an allowed phrase does not hide a longer guarded term that starts with it', () => {
  const terms = new Set([termHash('termo permitido longo')]);
  const allowed = new Set([termHash('termo permitido')]);

  expect(findPrivateTerms('termo permitido longo', terms, allowed)).toHaveLength(1);
});

test('scans the other cells of a bitmask table row', () => {
  const terms = new Set([termHash('termo proibido')]);

  expect(scanText('| 1 | 0101 | termo proibido |', terms)).toEqual([1]);
  expect(scanText('| 1 | 0101 | linha limpa |', terms)).toEqual([]);
});

test('finds a guarded number written with a thousands separator', () => {
  const terms = new Set([termHash('1234.56'), termHash('1234567'), termHash('7654.5')]);

  expect(findPrivateTerms('R$ 1.234,56', terms)).toHaveLength(1);
  expect(findPrivateTerms('--account 1.234.567', terms)).toHaveLength(1);
  expect(findPrivateTerms('R$ 7.654,50', terms)).toHaveLength(1);
  expect(findPrivateTerms('R$ 1.234,57', terms)).toEqual([]);
});

test('finds a guarded number followed by sentence punctuation', () => {
  const terms = new Set([termHash('1234.56')]);

  expect(findPrivateTerms('o saldo era R$ 1.234,56.', terms)).toHaveLength(1);
  expect(findPrivateTerms('R$ 1.234,56, e depois outro', terms)).toHaveLength(1);
  expect(findPrivateTerms('R$ 1.234,567', terms)).toEqual([]);
});

test('finds a guarded number whose separators are escaped for a regex', () => {
  const terms = new Set([termHash('1234.56'), termHash('7654.5')]);

  expect(findPrivateTerms(String.raw`R$ 1\.234,56`, terms)).toHaveLength(1);
  expect(findPrivateTerms(String.raw`R$ 7\.654,50`, terms)).toHaveLength(1);
  expect(findPrivateTerms(String.raw`R$ 1\.234,57`, terms)).toEqual([]);
});

test('matches a hash in the stored normalized form, not one recomputed from the text', () => {
  const stored = new Set(['b45f4536f9e5072382394c5a2e64a864548f6d80c5a828243f1abe4175c7a794']);

  expect(findPrivateTerms('  São JOÃO ', stored)).toHaveLength(1);
});

test('fails on a versioned file carrying a prohibited term and passes without it', () => {
  const root = mkdtempSync(join(tmpdir(), 'mdcli-private-terms-'));
  try {
    Bun.spawnSync(['git', 'init', '-q'], { cwd: root });
    writeFileSync(join(root, 'note.txt'), `linha limpa\n${fakeTerm} aqui\n`);
    Bun.spawnSync(['git', 'add', 'note.txt'], { cwd: root });

    expect(scanTrackedFiles(root, fakeHashes)).toEqual([{ file: 'note.txt', line: 2 }]);

    writeFileSync(join(root, 'note.txt'), 'linha limpa\noutra linha limpa\n');
    expect(scanTrackedFiles(root, fakeHashes)).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// A canary whose hash is in the production set. It is base64 here so this
// test file does not itself carry a guarded term; the mixed case and accent
// also prove the guard normalizes the text before hashing.
const canaryTerm = Buffer.from('Q0FOw4FSSU8gc2ludMOpdGljbw==', 'base64').toString();

test('detects a canary term from the production set in a temporary repository', () => {
  const root = mkdtempSync(join(tmpdir(), 'mdcli-private-terms-'));
  try {
    Bun.spawnSync(['git', 'init', '-q'], { cwd: root });
    writeFileSync(join(root, 'note.txt'), 'linha limpa\noutra linha limpa\n');
    Bun.spawnSync(['git', 'add', 'note.txt'], { cwd: root });
    expect(scanTrackedFiles(root)).toEqual([]);

    writeFileSync(join(root, 'note.txt'), `linha limpa\n${canaryTerm} aqui\n`);
    expect(scanTrackedFiles(root)).toEqual([{ file: 'note.txt', line: 2 }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The full-tree scan runs as the `private terms` step of scripts/verify.sh,
// outside the parallel batch: under that load it took 6-10 s and blew Bun's 5 s
// default timeout (#218). This asserts the entry point the verify step calls,
// and that a subdirectory still scans the whole repository (#233).
test('the guard script scans the repository root from a subdirectory', () => {
  const root = mkdtempSync(join(tmpdir(), 'mdcli-private-terms-script-'));
  const script = join(import.meta.dirname, '..', 'scripts', 'private-terms.ts');
  const sub = join(root, 'sub');
  const run = () => Bun.spawnSync([process.execPath, script], { cwd: sub });
  try {
    Bun.spawnSync(['git', 'init', '-q'], { cwd: root });
    mkdirSync(sub);
    writeFileSync(join(sub, 'note.txt'), 'linha limpa\noutra linha limpa\n');
    Bun.spawnSync(['git', 'add', '.'], { cwd: root });

    expect(run().exitCode).toBe(0);

    writeFileSync(join(root, 'canary.txt'), `linha limpa\n${canaryTerm} aqui\n`);
    Bun.spawnSync(['git', 'add', 'canary.txt'], { cwd: root });
    const hit = run();
    expect(hit.exitCode).toBe(1);
    expect(hit.stderr.toString()).toContain('canary.txt:2');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
