import { expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commitSources, messageHits, pullRequestSource } from '../scripts/check-private-messages.js';
import { keyedTermHash, termHash } from '../scripts/private-terms.js';

const fakeTerm = 'termo-sintetico-proibido';
const fakeHashes = new Set([termHash(fakeTerm)]);
const repoRoot = join(import.meta.dir, '..');

function fakeGh(script: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'mdcli-fake-gh-'));
  const path = join(dir, 'gh');
  writeFileSync(path, `#!/bin/sh\n${script}\n`);
  chmodSync(path, 0o755);
  return dir;
}

async function runScript(ghDir: string): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const { PR_BODY: _ignored, ...env } = process.env;
  const proc = Bun.spawn(
    [process.execPath, join(repoRoot, 'scripts', 'check-private-messages.ts'), '--base', 'HEAD'],
    {
      cwd: repoRoot,
      env: { ...env, PATH: `${ghDir}:${process.env.PATH ?? ''}` },
      stdout: 'pipe',
      stderr: 'pipe',
    }
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
}

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

test('detects a keyed numeric term in a message only with the key', () => {
  const key = 'test-key';
  const keyed = new Set([keyedTermHash('12345', key)]);
  const sources = [{ label: 'commit abc', text: 'linha\n12345 aqui' }];

  expect(messageHits(sources, new Set(), undefined, keyed, key)).toEqual([{ label: 'commit abc', lines: [2] }]);

  const previous = process.env.MDCLI_PRIVATE_TERMS_KEY;
  delete process.env.MDCLI_PRIVATE_TERMS_KEY;
  try {
    expect(messageHits(sources, new Set(), undefined, keyed)).toEqual([]);
  } finally {
    if (previous !== undefined) process.env.MDCLI_PRIVATE_TERMS_KEY = previous;
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

test('the verify workflow reruns when the PR body is edited', async () => {
  const workflow = Bun.YAML.parse(await Bun.file(join(repoRoot, '.github/workflows/ci.yml')).text()) as {
    on: { pull_request: { types: string[] } };
  };
  expect(workflow.on.pull_request.types).toContain('edited');
});

test('waits for a gh slower than five seconds instead of dropping the PR body', async () => {
  const dir = fakeGh(`sleep 6\nprintf '%s' '{"body":"corpo sintetico"}'`);
  try {
    const result = await runScript(dir);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('PR body checked');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reports that the PR body was not checked when gh fails', async () => {
  const dir = fakeGh(`echo 'no pull requests found' >&2\nexit 1`);
  try {
    const result = await runScript(dir);
    expect(result.code).toBe(0);
    expect(result.stderr).toContain('PR body not checked');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
