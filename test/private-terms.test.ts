import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findPrivateTerms, scanTrackedFiles, scanText, termHash } from '../scripts/private-terms.js';

const fakeTerm = 'termo-sintetico-proibido';
const fakeHashes = new Set([termHash(fakeTerm)]);

/** A temporary repository the guard can read a commit from. */
function withRepo(run: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'mdcli-private-terms-'));
  try {
    git(root, ['init', '-q']);
    git(root, ['config', 'user.email', 'test@example.com']);
    git(root, ['config', 'user.name', 'Test']);
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function git(root: string, args: string[]): string {
  const result = Bun.spawnSync(['git', ...args], { cwd: root });
  if (result.exitCode !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr.toString()}`);
  return result.stdout.toString();
}

function commitAll(root: string, message: string): void {
  git(root, ['add', '-A']);
  // Keep the temp commit hermetic: a signing or hooks setup in the machine's
  // global git config must not change the suite's result.
  git(root, ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', message]);
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
    git(root, ['rm', '--cached', '-q', 'note.txt']);

    // The file is invisible to the old working-tree source: `git ls-files`
    // prints nothing, so only the commit still carries the term.
    expect(git(root, ['ls-files'])).toBe('');
    expect(scanTrackedFiles(root, fakeHashes)).toEqual([{ file: 'note.txt', line: 2 }]);
  });
});

test('detects a term that is only staged, before it is committed', () => {
  withRepo((root) => {
    writeFileSync(join(root, 'clean.txt'), 'linha limpa\n');
    commitAll(root, 'base');
    writeFileSync(join(root, 'leak.txt'), `linha limpa\n${fakeTerm} aqui\n`);
    git(root, ['add', 'leak.txt']);

    // HEAD still lacks the file: only the index carries the staged term.
    expect(git(root, ['ls-tree', '-r', '--name-only', 'HEAD'])).not.toContain('leak.txt');
    expect(scanTrackedFiles(root, fakeHashes)).toEqual([{ file: 'leak.txt', line: 2 }]);
  });
});

test('detects a term in a tracked file that is not staged yet', () => {
  withRepo((root) => {
    writeFileSync(join(root, 'note.txt'), 'linha limpa\n');
    commitAll(root, 'base');
    writeFileSync(join(root, 'note.txt'), `linha limpa\n${fakeTerm} aqui\n`);

    expect(git(root, ['status', '--short', 'note.txt'])).toContain(' M note.txt');
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
