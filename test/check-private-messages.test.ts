import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commitSources, messageHits, pullRequestSource } from '../scripts/check-private-messages.js';
import { termHash } from '../scripts/private-terms.js';

const fakeTerm = 'termo-sintetico-proibido';
const fakeHashes = new Set([termHash(fakeTerm)]);

function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'mdcli-private-messages-'));
  Bun.spawnSync(['git', 'init', '-q'], { cwd: root });
  Bun.spawnSync(['git', 'config', 'user.email', 'test@example.com'], { cwd: root });
  Bun.spawnSync(['git', 'config', 'user.name', 'Test'], { cwd: root });
  return root;
}

function commit(root: string, message: string): string {
  writeFileSync(join(root, 'note.txt'), `${message}\n`);
  Bun.spawnSync(['git', 'add', 'note.txt'], { cwd: root });
  Bun.spawnSync(['git', 'commit', '-q', '-m', message], { cwd: root });
  return Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: root }).stdout.toString().trim();
}

test('reports a commit message carrying a term and passes on a clean range', () => {
  const root = tempRepo();
  try {
    const base = commit(root, 'clean baseline');
    const hit = commit(root, `subject\n\n${fakeTerm} aqui`);
    const clean = commit(root, 'clean tail');

    expect(messageHits(commitSources(base, root), fakeHashes)).toEqual([
      { label: `commit ${hit.slice(0, 7)}`, lines: [3] },
    ]);
    expect(messageHits(commitSources(clean, root), fakeHashes)).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// A canary whose hash is in the production set; base64 keeps this file free of
// the guarded term while still proving the default set catches it.
const canaryTerm = Buffer.from('Q0FOw4FSSU8gc2ludMOpdGljbw==', 'base64').toString();

test('detects a canary term from the production set in a commit message', () => {
  const root = tempRepo();
  try {
    const base = commit(root, 'clean baseline');
    commit(root, `subject\n\n${canaryTerm} aqui`);

    expect(messageHits(commitSources(base, root))).toHaveLength(1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('reports the PR body lines from PR_BODY and ignores an empty one', () => {
  const previous = process.env.PR_BODY;
  try {
    process.env.PR_BODY = `linha limpa\n${fakeTerm} aqui`;
    expect(messageHits([pullRequestSource()!], fakeHashes)).toEqual([{ label: 'PR body', lines: [2] }]);

    process.env.PR_BODY = '';
    expect(pullRequestSource()).toBeUndefined();
  } finally {
    if (previous === undefined) delete process.env.PR_BODY;
    else process.env.PR_BODY = previous;
  }
});
