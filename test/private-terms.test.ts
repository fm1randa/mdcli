import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  KEYED_TERM_HASHES,
  PRIVATE_TERM_HASHES,
  findPrivateTerms,
  keyedTermHash,
  privateTermsKey,
  requirePrivateTermsKey,
  scanTrackedFiles,
  scanText,
  termHash,
} from '../scripts/private-terms.js';
import { git } from '../scripts/git.js';
import { commitAll } from './git-repo.js';

const fakeTerm = 'termo-sintetico-proibido';
const fakeHashes = new Set([termHash(fakeTerm)]);

/** A temporary repository the guard can read a commit from. */
function withRepo(run: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'mdcli-private-terms-'));
  try {
    git(['init', '-q'], root);
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

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

test('detects a keyed numeric term only with the key', () => {
  const key = 'test-key';
  const keyed = new Set([keyedTermHash('12345', key)]);

  expect(findPrivateTerms('12345', new Set(), new Set(), keyed, key)).toHaveLength(1);
  expect(findPrivateTerms('12345', new Set(), new Set(), keyed, undefined)).toEqual([]);
  expect(findPrivateTerms('linha limpa', new Set(), new Set(), keyed, key)).toEqual([]);
});

test('an unsalted hash of a numeric term is not in the public set', () => {
  expect(PRIVATE_TERM_HASHES.has(termHash('12345'))).toBe(false);
  expect(KEYED_TERM_HASHES.has(termHash('12345'))).toBe(false);
});

// A synthetic number whose keyed hash is in the production set. Base64 keeps
// this file free of the guarded number while the test rebuilds it. With the
// key available (the maintainer's file or the CI secret), the guard detects
// it; without the key it warns and skips it.
const keyedCanary = Buffer.from('OTE4MjczNjQ1', 'base64').toString();

test('detects the keyed canary from the production set when the key is available', () => {
  const key = privateTermsKey();
  if (key === undefined) return;
  expect(findPrivateTerms(keyedCanary, new Set(), new Set(), KEYED_TERM_HASHES, key)).toHaveLength(1);
  expect(PRIVATE_TERM_HASHES.has(termHash(keyedCanary))).toBe(false);
});

test('requires the key only when the environment demands it', () => {
  const previousKey = process.env.MDCLI_PRIVATE_TERMS_KEY;
  const previousRequire = process.env.MDCLI_REQUIRE_PRIVATE_TERMS_KEY;
  try {
    delete process.env.MDCLI_PRIVATE_TERMS_KEY;
    delete process.env.MDCLI_REQUIRE_PRIVATE_TERMS_KEY;
    expect(requirePrivateTermsKey()).toBeUndefined();

    process.env.MDCLI_REQUIRE_PRIVATE_TERMS_KEY = '1';
    expect(() => requirePrivateTermsKey()).toThrow(/MDCLI_PRIVATE_TERMS_KEY/);

    process.env.MDCLI_PRIVATE_TERMS_KEY = 'test-key';
    expect(requirePrivateTermsKey()).toBe('test-key');
  } finally {
    if (previousKey === undefined) delete process.env.MDCLI_PRIVATE_TERMS_KEY;
    else process.env.MDCLI_PRIVATE_TERMS_KEY = previousKey;
    if (previousRequire === undefined) delete process.env.MDCLI_REQUIRE_PRIVATE_TERMS_KEY;
    else process.env.MDCLI_REQUIRE_PRIVATE_TERMS_KEY = previousRequire;
  }
});

test('detects a keyed numeric term in a committed file with a test key', () => {
  const key = 'test-key';
  const keyed = new Set([keyedTermHash('12345', key)]);
  withRepo((root) => {
    writeFileSync(join(root, 'note.txt'), 'linha limpa\n12345 aqui\n');
    commitAll(root, 'add the id');

    expect(scanTrackedFiles(root, new Set(), new Set(), 'HEAD', keyed, key)).toEqual([
      { file: 'note.txt', line: 2 },
    ]);
    expect(scanTrackedFiles(root, new Set(), new Set(), 'HEAD', keyed, undefined)).toEqual([]);
  });
});

test('fails on a committed file carrying a prohibited term and passes without it', () => {
  withRepo((root) => {
    writeFileSync(join(root, 'note.txt'), `linha limpa\n${fakeTerm} aqui\n`);
    commitAll(root, 'add the term');

    expect(scanTrackedFiles(root, fakeHashes)).toEqual([{ file: 'note.txt', line: 2 }]);

    writeFileSync(join(root, 'note.txt'), 'linha limpa\noutra linha limpa\n');
    commitAll(root, 'remove the term');
    expect(scanTrackedFiles(root, fakeHashes)).toEqual([]);
  });
});

test('detects a term that is only in the commit, after the file leaves the worktree', () => {
  withRepo((root) => {
    writeFileSync(join(root, 'note.txt'), `linha limpa\n${fakeTerm} aqui\n`);
    commitAll(root, 'add the term');
    rmSync(join(root, 'note.txt'));
    git(['rm', '--cached', '-q', 'note.txt'], root);

    // The file is invisible to the old working-tree source: `git ls-files`
    // prints nothing, so only the commit still carries the term.
    expect(git(['ls-files'], root)).toBe('');
    expect(scanTrackedFiles(root, fakeHashes)).toEqual([{ file: 'note.txt', line: 2 }]);
  });
});

test('detects a term that is only staged, before it is committed', () => {
  withRepo((root) => {
    writeFileSync(join(root, 'clean.txt'), 'linha limpa\n');
    commitAll(root, 'base');
    writeFileSync(join(root, 'leak.txt'), `linha limpa\n${fakeTerm} aqui\n`);
    git(['add', 'leak.txt'], root);

    // HEAD still lacks the file: only the index carries the staged term.
    expect(git(['ls-tree', '-r', '--name-only', 'HEAD'], root)).not.toContain('leak.txt');
    expect(scanTrackedFiles(root, fakeHashes)).toEqual([{ file: 'leak.txt', line: 2 }]);
  });
});

test('detects a term in a tracked file that is not staged yet', () => {
  withRepo((root) => {
    writeFileSync(join(root, 'note.txt'), 'linha limpa\n');
    commitAll(root, 'base');
    writeFileSync(join(root, 'note.txt'), `linha limpa\n${fakeTerm} aqui\n`);

    expect(git(['status', '--short', 'note.txt'], root)).toContain(' M note.txt');
    expect(scanTrackedFiles(root, fakeHashes)).toEqual([{ file: 'note.txt', line: 2 }]);
  });
});

test('detects a guarded term in a file path, not only in its content', () => {
  withRepo((root) => {
    writeFileSync(join(root, `${fakeTerm}.txt`), 'linha limpa\n');
    commitAll(root, 'add a clean file with a guarded name');

    expect(scanTrackedFiles(root, fakeHashes)).toEqual([{ file: `${fakeTerm}.txt` }]);
  });
});

test('scans a blob with NUL bytes instead of skipping it', () => {
  withRepo((root) => {
    writeFileSync(join(root, 'blob.bin'), Buffer.concat([Buffer.from([0, 0]), Buffer.from(fakeTerm)]));
    commitAll(root, 'add a binary blob');

    expect(scanTrackedFiles(root, fakeHashes)).toEqual([{ file: 'blob.bin', line: 1 }]);
  });
});

test('fails loudly instead of skipping a blob above the scan limit', () => {
  withRepo((root) => {
    writeFileSync(join(root, 'big.txt'), 'a'.repeat(1_000_001));
    commitAll(root, 'add a large blob');

    expect(() => scanTrackedFiles(root, fakeHashes)).toThrow(/big\.txt.*above the 1000000-byte scan limit/);
  });
});

// A canary whose hash is in the production set. It is base64 here so this
// test file does not itself carry a guarded term; the mixed case and accent
// also prove the guard normalizes the text before hashing.
const canaryTerm = Buffer.from('Q0FOw4FSSU8gc2ludMOpdGljbw==', 'base64').toString();

test('detects a canary term from the production set in a temporary repository', () => {
  withRepo((root) => {
    writeFileSync(join(root, 'note.txt'), 'linha limpa\noutra linha limpa\n');
    commitAll(root, 'clean note');
    expect(scanTrackedFiles(root)).toEqual([]);

    writeFileSync(join(root, 'note.txt'), `linha limpa\n${canaryTerm} aqui\n`);
    commitAll(root, 'add the canary');
    expect(scanTrackedFiles(root)).toEqual([{ file: 'note.txt', line: 2 }]);
  });
});

test('no committed file or path carries a private term', () => {
  expect(scanTrackedFiles()).toEqual([]);
});

// The full-tree scan runs as the `private terms` step of scripts/verify.sh,
// outside the parallel batch: under that load it took 6-10 s and blew Bun's 5 s
// default timeout (#218). This asserts the entry point the verify step calls,
// and that a subdirectory still scans the whole repository (#233).
test('the guard script scans the repository root from a subdirectory', () => {
  const root = mkdtempSync(join(tmpdir(), 'mdcli-private-terms-script-'));
  const script = join(import.meta.dirname, '..', 'scripts', 'private-terms-cli.ts');
  const sub = join(root, 'sub');
  const run = () => Bun.spawnSync([process.execPath, script], { cwd: sub });
  try {
    git(['init', '-q'], root);
    mkdirSync(sub);
    writeFileSync(join(sub, 'note.txt'), 'linha limpa\noutra linha limpa\n');
    git(['add', '.'], root);

    expect(run().exitCode).toBe(0);

    writeFileSync(join(root, 'canary.txt'), `linha limpa\n${canaryTerm} aqui\n`);
    git(['add', 'canary.txt'], root);
    const hit = run();
    expect(hit.exitCode).toBe(1);
    expect(hit.stderr.toString()).toContain('canary.txt:2');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the guard script fails when the environment requires the key and it is unset', () => {
  const root = mkdtempSync(join(tmpdir(), 'mdcli-private-require-'));
  const script = join(import.meta.dirname, '..', 'scripts', 'private-terms-cli.ts');
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined) env[name] = value;
  }
  env.MDCLI_REQUIRE_PRIVATE_TERMS_KEY = '1';
  delete env.MDCLI_PRIVATE_TERMS_KEY;
  try {
    git(['init', '-q'], root);
    writeFileSync(join(root, 'note.txt'), 'linha limpa\n');
    git(['add', '.'], root);

    const missing = Bun.spawnSync([process.execPath, script], { cwd: root, env });
    expect(missing.exitCode).toBe(1);
    expect(missing.stderr.toString()).toContain('MDCLI_PRIVATE_TERMS_KEY');

    const present = Bun.spawnSync([process.execPath, script], {
      cwd: root,
      env: { ...env, MDCLI_PRIVATE_TERMS_KEY: 'test-key' },
    });
    expect(present.exitCode).toBe(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
