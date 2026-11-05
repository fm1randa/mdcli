import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commitSources, messageHits, pullRequestSource } from '../scripts/check-private-messages.js';
import { termHash } from '../scripts/private-terms.js';

const fakeTerm = 'termo-sintetico-proibido';
const fakeHashes = new Set([termHash(fakeTerm)]);

async function git(root: string, ...args: string[]): Promise<string> {
  const proc = Bun.spawn(
    ['git', '--no-pager', '-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args],
    { cwd: root, stdout: 'pipe', stderr: 'pipe' }
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`git ${args.join(' ')} failed: ${stderr.trim()}`);
  return stdout.trim();
}

async function tempRepo(): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), 'mdcli-private-messages-'));
  await git(root, 'init', '-q');
  return root;
}

async function commit(root: string, message: string): Promise<string> {
  writeFileSync(join(root, 'note.txt'), `${message}\n`);
  await git(root, 'add', 'note.txt');
  await git(root, 'commit', '-q', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

test('reports a commit message carrying a term and passes on a clean range', async () => {
  const root = await tempRepo();
  try {
    const base = await commit(root, 'clean baseline');
    const hit = await commit(root, `subject\n\n${fakeTerm} aqui`);
    const clean = await commit(root, 'clean tail');

    expect(messageHits(await commitSources(base, root), fakeHashes)).toEqual([
      { label: `commit ${hit.slice(0, 7)}`, lines: [3] },
    ]);
    expect(messageHits(await commitSources(clean, root), fakeHashes)).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// A canary whose hash is in the production set; base64 keeps this file free of
// the guarded term while still proving the default set catches it.
const canaryTerm = Buffer.from('Q0FOw4FSSU8gc2ludMOpdGljbw==', 'base64').toString();

test('detects a canary term from the production set in a commit message', async () => {
  const root = await tempRepo();
  try {
    const base = await commit(root, 'clean baseline');
    await commit(root, `subject\n\n${canaryTerm} aqui`);

    expect(messageHits(await commitSources(base, root))).toHaveLength(1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('reports the PR body lines from PR_BODY and ignores an empty one', async () => {
  const previous = process.env.PR_BODY;
  try {
    process.env.PR_BODY = `linha limpa\n${fakeTerm} aqui`;
    expect(messageHits([(await pullRequestSource())!], fakeHashes)).toEqual([{ label: 'PR body', lines: [2] }]);

    process.env.PR_BODY = '';
    expect(await pullRequestSource()).toBeUndefined();
  } finally {
    if (previous === undefined) delete process.env.PR_BODY;
    else process.env.PR_BODY = previous;
  }
});
