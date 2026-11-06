import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';
import type { Command as Commander } from 'commander';
import { buildProgram } from '../src/program.js';

const ROOT = `${import.meta.dir}/..`;

// Every command a user can run has a `mdcli <command path>` example in both
// READMEs, and every visible long option of those commands appears in both.
// Hidden options are skipped on purpose: `--scheduled` is a hidden deprecated
// alias of `--pending`. Walks the real commander tree, so a new command or
// option fails here until it is documented (entries import and sync shipped
// without one).
type Command = { path: string; options: string[] };

function walk(command: Commander, prefix: string[]): Command[] {
  return command.commands.flatMap((sub) => {
    const path = [...prefix, sub.name()];
    return sub.commands.length === 0
      ? [{
          path: path.join(' '),
          options: sub.options.flatMap((option) =>
            !option.hidden && typeof option.long === 'string' ? [option.long] : []
          ),
        }]
      : walk(sub, path);
  });
}

const COMMANDS = walk(await buildProgram(), ['mdcli']);
const PATHS = COMMANDS.map((command) => command.path);

/** Escape regex metacharacters so a literal command path or option can be matched. */
function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The command paths the file never shows; `mdcli tags list` does not count as `mdcli tags list-all`. */
function undocumented(file: string): string[] {
  const text = readFileSync(`${ROOT}/${file}`, 'utf8');
  return PATHS.filter((path) => !new RegExp(`${escape(path)}(?![\\w-])`).test(text));
}

/** The `path option` pairs the file never shows; `--to` does not count as `--to-account`. */
function undocumentedOptions(file: string): string[] {
  const text = readFileSync(`${ROOT}/${file}`, 'utf8');
  return COMMANDS.flatMap(({ path, options }) =>
    options
      .filter((option) => !new RegExp(`${escape(option)}(?![\\w-])`).test(text))
      .map((option) => `${path} ${option}`),
  );
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

    test(`${file} shows every command option`, () => {
      const missing = undocumentedOptions(file);
      if (missing.length > 0) {
        throw new Error(
          `${file} has no example of: ${missing.join(', ')}. ` +
            'Document every long option in README.md and its translation to README.en.md.',
        );
      }
    });
  }
});
