import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

test('finds a guarded number whose separators are escaped for a regex', () => {
  const terms = new Set([termHash('1234.56'), termHash('7654.5')]);

  expect(findPrivateTerms(String.raw`R$ 1\.234,56`, terms)).toHaveLength(1);
  expect(findPrivateTerms(String.raw`R$ 7\.654,50`, terms)).toHaveLength(1);
  expect(findPrivateTerms(String.raw`R$ 1\.234,57`, terms)).toEqual([]);
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

test('no versioned file carries a private term', () => {
  expect(scanTrackedFiles()).toEqual([]);
});
