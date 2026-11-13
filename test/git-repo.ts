import { git } from '../scripts/git.js';

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
export async function commitAll(root: string, message: string, ...flags: string[]): Promise<string> {
  await git(['add', '-A'], root);
  await git([...COMMIT, ...flags, '-m', message], root);
  return (await git(['rev-parse', 'HEAD'], root)).trim();
}
