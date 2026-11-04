import { expect, test } from 'bun:test';
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

test('no versioned file carries a private term', () => {
  expect(scanTrackedFiles()).toEqual([]);
});
