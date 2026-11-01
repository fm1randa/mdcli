import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

const ROOT = `${import.meta.dir}/..`;

// Every command a user can run has a `mdcli <command path>` example in both
// READMEs. Walks the real commander tree, so a new command fails here until
// it is documented (entries import and sync shipped without one). The walk
// runs in its own process: importing the commands here would load
// src/lib/api.ts, which reads MDCLI_API_URL once, before other test files set it.
const WALK = `
  import { buildProgram } from './src/program.ts';
  const program = await buildProgram();
  const walk = (command, prefix) => command.commands.flatMap((sub) => {
    const path = [...prefix, sub.name()];
    return sub.commands.length === 0 ? [path.join(' ')] : walk(sub, path);
  });
  console.log(JSON.stringify(walk(program, ['mdcli'])));
`;

function commandPaths(): string[] {
  const walked = Bun.spawnSync(['bun', '-e', WALK], { cwd: ROOT });
  if (walked.exitCode !== 0) throw new Error(walked.stderr.toString());
  return JSON.parse(walked.stdout.toString()) as string[];
}

const PATHS = commandPaths();

/** The command paths the file never shows; `mdcli tags list` does not count as `mdcli tags list-all`. */
function undocumented(file: string): string[] {
  const text = readFileSync(`${ROOT}/${file}`, 'utf8');
  return PATHS.filter((path) => !new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(text));
}

describe('README command coverage', () => {
  test('walks nested commands down to the leaves', () => {
    expect(PATHS).toContain('mdcli entries import run');
    expect(PATHS).toContain('mdcli accounts alias rm');
    expect(PATHS).not.toContain('mdcli entries import');
  });

  for (const file of ['README.md', 'README.en.md']) {
    test(`${file} shows every command`, () => {
      const missing = undocumented(file);
      if (missing.length > 0) {
        throw new Error(
          `${file} has no example of: ${missing.join(', ')}. ` +
            'Add a usage line for each one to README.md and its translation to README.en.md.',
        );
      }
    });
  }
});
