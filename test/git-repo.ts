import { git, gitAsync } from '../scripts/git.js';

// A throwaway commit stays hermetic: the machine's identity, signing or hooks
// in its global git config must not change the suite's result.
const COMMIT = [
  '-c', 'user.name=test',
  '-c', 'user.email=test@example.com',
  '-c', 'commit.gpgsign=false',
  '-c', 'core.hooksPath=/dev/null',
  'commit', '-q',
] as const;

/** Commits every change under `root` and returns the new HEAD. */
export function commitAll(root: string, message: string, ...flags: string[]): string {
  git(['add', '-A'], root);
  git([...COMMIT, ...flags, '-m', message], root);
  return git(['rev-parse', 'HEAD'], root).trim();
}

/** commitAll off the spawnSync path, for tests that hit oven-sh/bun#34069 (see spawnAsync). */
export async function commitAllAsync(root: string, message: string): Promise<string> {
  await gitAsync(['add', '-A'], root);
  await gitAsync([...COMMIT, '-m', message], root);
  return (await gitAsync(['rev-parse', 'HEAD'], root)).trim();
}
