import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { git, gitBytes, gitQuiet, revisionExists } from '../scripts/git.js';

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
});
