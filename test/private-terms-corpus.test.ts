import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ALLOWED_PHRASE_HASHES,
  KEYED_TERM_HASHES,
  PRIVATE_TERM_HASHES,
  formattedNumberCandidates,
  keyedTermHash,
  normalizeTerm,
  termHash,
} from '../scripts/private-terms.js';
import { git, revisionExists } from '../scripts/git.js';
import { EXCUSED_REMOVED_TERMS } from '../scripts/private-terms-excused.js';
import { deletedLines, guardChanged, removedRunsBetween } from '../scripts/private-terms-corpus.js';
import { commitAll } from './git-repo.js';

const TERM = 'Conta Removida';

function initRepo(root: string): void {
  git(['init', '-q'], root);
}

function withRepo(base: string, head: string, callback: (root: string, base: string, head: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'mdcli-private-corpus-'));
  try {
    initRepo(root);
    writeFileSync(join(root, 'note.txt'), base);
    const baseCommit = commitAll(root, 'base');
    writeFileSync(join(root, 'note.txt'), head);
    const headCommit = commitAll(root, 'head');
    callback(root, baseCommit, headCommit);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** A shallow clone cannot replay the #177 migration; skip instead of failing. */
function hasHistory(): boolean {
  return ['0cf33e5', '73dc226'].every((rev) => revisionExists(`${rev}^{commit}`));
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
  const key = 'test-key';
  withRepo('nome permitido 12345\n', 'linha limpa\n', (root, base, head) => {
    const terms = new Set([termHash('nome permitido')]);
    const hits = removedRunsBetween(
      base,
      head,
      root,
      terms,
      ALLOWED_PHRASE_HASHES,
      EXCUSED_REMOVED_TERMS,
      new Set(),
      key
    );
    expect(hits.map((hit) => `${hit.file}:${hit.line}:${hit.hash}:${hit.numeric ?? false}`)).toEqual([
      `note.txt:1:${termHash('12345')}:true`,
    ]);

    const complete = new Set([keyedTermHash('12345', key)]);
    expect(
      removedRunsBetween(base, head, root, terms, ALLOWED_PHRASE_HASHES, EXCUSED_REMOVED_TERMS, complete, key)
    ).toEqual([]);
  });
});

test('skips a numeric term without the key instead of reporting a false positive', () => {
  const previous = process.env.MDCLI_PRIVATE_TERMS_KEY;
  delete process.env.MDCLI_PRIVATE_TERMS_KEY;
  try {
    withRepo('12345\n', 'linha limpa\n', (root, base, head) => {
      expect(
        removedRunsBetween(base, head, root, new Set(), ALLOWED_PHRASE_HASHES, EXCUSED_REMOVED_TERMS, KEYED_TERM_HASHES)
      ).toEqual([]);
    });
  } finally {
    if (previous !== undefined) process.env.MDCLI_PRIVATE_TERMS_KEY = previous;
  }
});

test('an unsalted hash never covers a numeric removed term', () => {
  const key = 'test-key';
  withRepo('12345\n', 'linha limpa\n', (root, base, head) => {
    const unsalted = new Set([termHash('12345')]);
    const hits = removedRunsBetween(
      base,
      head,
      root,
      unsalted,
      ALLOWED_PHRASE_HASHES,
      EXCUSED_REMOVED_TERMS,
      new Set(),
      key
    );
    expect(hits.map((hit) => hit.numeric)).toEqual([true]);

    const keyed = new Set([keyedTermHash('12345', key)]);
    expect(
      removedRunsBetween(base, head, root, unsalted, ALLOWED_PHRASE_HASHES, EXCUSED_REMOVED_TERMS, keyed, key)
    ).toEqual([]);
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

test('fails a removed term longer than the representation limit until every word is guarded', () => {
  const term = 'Conta Alfa Beta Gama Delta';
  const window = 'Conta Alfa Beta Gama';
  const tail = 'Alfa Beta Gama Delta';
  withRepo(`${term}\n`, 'linha limpa\n', (root, base, head) => {
    const unguarded = removedRunsBetween(base, head, root, new Set());
    expect(unguarded).toHaveLength(1);
    expect(unguarded[0]).toMatchObject({
      file: 'note.txt',
      line: 1,
      hash: termHash(window),
      overlong: 5,
    });

    expect(removedRunsBetween(base, head, root, new Set([termHash(window)])).map((hit) => hit.hash)).toEqual([
      termHash('Delta'),
    ]);
    expect(removedRunsBetween(base, head, root, new Set([termHash(tail)])).map((hit) => hit.hash)).toEqual([
      termHash('Conta'),
    ]);
    expect(removedRunsBetween(base, head, root, new Set([termHash(window), termHash(tail)]))).toEqual([]);
  });
});

test('a guarded sub-phrase covers only its own words in a longer run', () => {
  withRepo('Conta Alfa Beta Gama Delta\n', 'linha limpa\n', (root, base, head) => {
    const hits = removedRunsBetween(base, head, root, new Set([termHash('Conta Alfa')]));
    expect(hits.map((hit) => hit.hash)).toEqual([termHash('Beta Gama Delta')]);
  });
});

test('reports a removed long run when every four-word window survives separately', () => {
  const term = 'Conta Alfa Beta Gama Delta';
  withRepo(`${term}\n`, 'Conta Alfa Beta Gama\nAlfa Beta Gama Delta\n', (root, base, head) => {
    const hits = removedRunsBetween(base, head, root, new Set());
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ hash: termHash('Conta Alfa Beta Gama'), overlong: 5 });
  });
});

test('does not accept the full hash of a term longer than the representation limit', () => {
  const term = 'Conta Alfa Beta Gama Delta';
  withRepo(`${term}\n`, 'linha limpa\n', (root, base, head) => {
    const fullOnly = removedRunsBetween(base, head, root, new Set([termHash(term)]));
    expect(fullOnly).toHaveLength(1);
    expect(fullOnly[0]).toMatchObject({ overlong: 5, hash: termHash('Conta Alfa Beta Gama') });
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

replay('the public hash set carries no unsalted numeric fingerprint from the #177 migration', () => {
  const candidates = new Set<string>();
  for (const line of deletedLines('0cf33e5', '73dc226', process.cwd())) {
    for (const token of normalizeTerm(line.text).split(' ')) {
      if (/^\d+$/.test(token)) candidates.add(token);
    }
    for (const candidate of formattedNumberCandidates(line.text)) candidates.add(candidate);
  }
  // Positive control: the enumeration found the numbers, so an empty leak
  // below is not the empty set passing for the wrong reason.
  expect(candidates.size).toBeGreaterThan(100);
  let leaked = 0;
  for (const candidate of candidates) {
    if (PRIVATE_TERM_HASHES.has(termHash(candidate))) leaked++;
  }
  expect(leaked).toBe(0);
});

replay('the migration check reports a guard hash removed from the set', () => {
  const omitted = 'c6f0c3cf2b9f61109a022215d9f9e2e1618c6415bbc99bce799a23e2375cf9b3';
  expect(PRIVATE_TERM_HASHES.has(omitted)).toBe(true);
  const reduced = new Set([...PRIVATE_TERM_HASHES].filter((hash) => hash !== omitted));
  const hashes = removedRunsBetween('0cf33e5', '73dc226', undefined, reduced).map((hit) => hit.hash);
  expect(hashes).toContain(omitted);
});

test('requires the corpus when the guard or its history helper changes', () => {
  const root = mkdtempSync(join(tmpdir(), 'mdcli-private-scope-'));
  try {
    initRepo(root);
    mkdirSync(join(root, 'scripts'), { recursive: true });
    writeFileSync(join(root, 'scripts/private-terms.ts'), 'export const guard = 1;\n');
    writeFileSync(join(root, 'scripts/private-terms-history.ts'), 'export const history = 1;\n');
    writeFileSync(join(root, 'note.txt'), 'one\n');
    const base = commitAll(root, 'base');
    writeFileSync(join(root, 'note.txt'), 'two\n');
    const head = commitAll(root, 'head');
    expect(guardChanged(base, head, root)).toBe(false);

    writeFileSync(join(root, 'scripts/private-terms-history.ts'), 'export const history = 2;\n');
    const historyHead = commitAll(root, 'history');
    expect(guardChanged(head, historyHead, root)).toBe(true);

    writeFileSync(join(root, 'scripts/private-terms.ts'), 'export const guard = 2;\n');
    const guardHead = commitAll(root, 'guard');
    expect(guardChanged(historyHead, guardHead, root)).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
