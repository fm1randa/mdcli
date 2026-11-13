import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { git } from '../scripts/git.js';
import { readCommits, replayGates, type Gate } from '../scripts/replay-gates.js';
import { commitAll } from './git-repo.js';
import { run } from './run.js';

const script = join(import.meta.dir, '..', 'scripts', 'replay-gates.ts');

async function commit(root: string, message: string, files: Record<string, string>): Promise<string> {
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return commitAll(root, message);
}

interface Commits {
  risky: string;
  comment: string;
  docs: string;
}

async function withRepo(callback: (root: string, commits: Commits) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'mdcli-replay-gates-'));
  try {
    await git(['init', '-q'], root);
    await commit(root, 'base', { 'src/lib/api.ts': 'export const value = 1;\n', 'AGENTS.md': 'base\n' });
    const risky = await commit(root, 'feat(entries): change a write', {
      'src/lib/api.ts': 'export const value = 1;\ncreateEntry(payload);\n',
    });
    const comment = await commit(root, 'chore: only a comment', {
      'src/lib/api.ts': 'export const value = 1;\ncreateEntry(payload);\n// note\n',
    });
    const docs = await commit(root, 'docs: note', { 'AGENTS.md': 'base\nnote\n' });
    await callback(root, { risky, comment, docs });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('replayGates', () => {
  test('replays every registered gate against each commit and its own parent', async () => {
    await withRepo(async (root, shas) => {
      const report = replayGates(await readCommits('HEAD', 3, root));
      expect(report.commits.map((replay) => replay.sha)).toEqual([shas.docs, shas.comment, shas.risky]);

      const bySha = new Map(report.commits.map((replay) => [replay.sha, replay]));
      const verdicts = (sha: string): Record<string, boolean> =>
        Object.fromEntries(bySha.get(sha)!.decisions.map((decision) => [decision.gate, decision.fired]));

      expect(verdicts(shas.risky)).toEqual({ risk: true, 'fails-on-main': true, prova: true });
      expect(verdicts(shas.comment)).toEqual({ risk: false, 'fails-on-main': false, prova: false });
      expect(verdicts(shas.docs)).toEqual({ risk: false, 'fails-on-main': false, prova: false });

      const riskyDetail = bySha.get(shas.risky)!.decisions.find((decision) => decision.gate === 'risk')!.detail;
      expect(riskyDetail).toContain('src/lib/api.ts (write): data write behavior changed');
      expect(report.fired).toBe(3);
      expect(report.skipped).toBe(6);
    });
  });

  test('surfaces a gate that fires on a behavior-preserving commit', () => {
    const srcTouch: Gate = {
      name: 'src-touch',
      decide(commit) {
        const fired = commit.subject.startsWith('chore:') && commit.nameStatus.includes('src/');
        return { gate: 'src-touch', fired, detail: fired ? 'touches src/' : 'does not touch src/' };
      },
    };

    withRepo(async (root, shas) => {
      const report = replayGates(await readCommits('HEAD', 2, root), [srcTouch]);
      const comment = report.commits.find((replay) => replay.sha === shas.comment)!;
      expect(comment.decisions).toEqual([{ gate: 'src-touch', fired: true, detail: 'touches src/' }]);
      expect(report.fired).toBe(1);
      expect(report.skipped).toBe(1);
    });
  });
});

describe('replay-gates CLI', () => {
  test('lists firings and skips for the chosen gate without writing to the repository', async () => {
    await withRepo(async (root, shas) => {
      const before = await git(['status', '--porcelain'], root);
      const result = await run(['bun', script, '--rev', 'HEAD', '--commits', '3', '--gate', 'risk'], {
        cwd: root,
      });
      const output = result.stdout;

      expect(result.exitCode).toBe(0);
      expect(output).toContain('replay-gates: 3 commits from HEAD');
      expect(output).toContain(`${shas.risky.slice(0, 7)} feat(entries): change a write`);
      expect(output).toContain('risk: FIRED (src/lib/api.ts (write): data write behavior changed)');
      expect(output).toContain('risk: skipped (safe:');
      expect(output).not.toContain('fails-on-main:');
      expect(output).toContain('replay-gates: 1 fired, 2 skipped');
      expect(await git(['status', '--porcelain'], root)).toBe(before);
    });
  });

  test('rejects an unknown gate and names the registry', async () => {
    await withRepo(async (root) => {
      const result = await run(['bun', script, '--rev', 'HEAD', '--gate', 'nope'], {
        cwd: root,
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('unknown gate: nope (known: risk, fails-on-main, prova)');
    });
  });
});
