import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_BASE, diffAgainst, git, gitAsync, gitBytes, gitQuiet, parseBase, revisionExists, spawnAsync } from '../scripts/git.js';
import { commitAll } from './git-repo.js';

function withRepo(run: (repo: string) => void): void {
  const repo = mkdtempSync(join(tmpdir(), 'mdcli-git-owner-'));
  try {
    git(['init', '-q', '-b', 'main'], repo);
    run(repo);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

describe('scripts/git.ts', () => {
  // Without core.quotepath=false git prints "\303\247" for "ç", and a gate that
  // matches paths by name (risk, prova, the corpus) misses the file.
  test('lists a non-ASCII path as written, for every caller', () => {
    withRepo((repo) => {
      writeFileSync(join(repo, 'ação.ts'), 'export {};\n');
      git(['add', 'ação.ts'], repo);
      expect(git(['ls-files'], repo)).toBe('ação.ts\n');
      expect(git(['diff', '--cached', '--name-only'], repo)).toBe('ação.ts\n');
    });
  });

  test("throws git's own stderr with the command and the directory", () => {
    withRepo((repo) => {
      expect(() => gitBytes(['rev-parse', '--verify', 'no-such-ref'], repo)).toThrow(
        `git rev-parse --verify no-such-ref failed in ${repo}: fatal: Needed a single revision`
      );
    });
  });

  test('reports an unborn HEAD as a missing revision instead of throwing', () => {
    withRepo((repo) => {
      expect(revisionExists('HEAD', repo)).toBe(false);
      expect(gitQuiet(['rev-parse', '--verify', '--quiet', 'HEAD'], repo)).toBeUndefined();
      git(['-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-q', '--allow-empty', '-m', 'first'], repo);
      expect(revisionExists('HEAD', repo)).toBe(true);
    });
  });

  test('takes --base out of argv and leaves the other flags in order', () => {
    expect(parseBase(['--diff', 'a.diff', '--base', 'HEAD~2', '--body-file', 'b.md'])).toEqual({
      base: 'HEAD~2',
      rest: ['--diff', 'a.diff', '--body-file', 'b.md'],
    });
    expect(parseBase(['--head', 'HEAD'])).toEqual({ base: DEFAULT_BASE, rest: ['--head', 'HEAD'] });
  });

  test('refuses a --base without a revision instead of falling back to origin/main', () => {
    expect(() => parseBase(['--base'])).toThrow('--base needs a revision');
    expect(() => parseBase(['--base', '--head', 'HEAD'])).toThrow('--base needs a revision');
  });

  test('diffs what the branch changed since it left the base, not what the base gained since', () => {
    withRepo((repo) => {
      writeFileSync(join(repo, 'a.ts'), 'export const a = 1;\n');
      const base = commitAll(repo, 'base');
      git(['checkout', '-q', '-b', 'feature'], repo);
      writeFileSync(join(repo, 'ação.ts'), 'export {};\n');
      commitAll(repo, 'feature');
      git(['checkout', '-q', 'main'], repo);
      writeFileSync(join(repo, 'main-only.ts'), 'export {};\n');
      commitAll(repo, 'main moves on');

      expect(diffAgainst('main', { head: 'feature', flags: ['--name-only'], cwd: repo })).toBe('ação.ts\n');
      expect(diffAgainst(base, { head: 'feature', flags: ['--name-only'], paths: ['a.ts'], cwd: repo })).toBe('');
    });
  });

  test("gitAsync returns stdout and throws git's own stderr", async () => {
    const repo = mkdtempSync(join(tmpdir(), 'mdcli-git-async-'));
    try {
      await gitAsync(['init', '-q', '-b', 'main'], repo);
      expect(await gitAsync(['symbolic-ref', 'HEAD'], repo)).toBe('refs/heads/main\n');
      await expect(gitAsync(['rev-parse', '--verify', 'no-such-ref'], repo)).rejects.toThrow(
        `git rev-parse --verify no-such-ref failed in ${repo}: fatal: Needed a single revision`
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

// Each gate used to read `argv[++index] ?? options.base`, so `--base` with its
// value missing (an unset variable in CI) ran the gate against origin/main.
describe('a gate given --base without a revision', () => {
  const root = join(import.meta.dir, '..');
  const gates = ['risk', 'prova', 'new-tests-fail-on-main', 'check-eslint-disables', 'check-private-messages', 'private-terms-corpus'];
  for (const gate of gates) {
    test(`${gate} fails and names the missing revision`, async () => {
      const run = await spawnAsync([process.execPath, join(root, 'scripts', `${gate}.ts`), '--base'], { cwd: root });
      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain('--base needs a revision');
    });
  }
});
