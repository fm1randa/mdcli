import { describe, expect, test } from 'bun:test';
import { behaviorIndexes, changesBehavior, parseDiff } from '../scripts/behavior-change.js';
import { changesProduct } from '../scripts/new-tests-fail-on-main.js';
import { requiresProva } from '../scripts/prova.js';
import { classifyRisk } from '../scripts/risk.js';

function file(path: string, body: string[]): string {
  return [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, '@@ -1,4 +1,4 @@', ...body].join('\n');
}

function diffFor(path: string, removed: string, added: string): string {
  return file(path, [`-${removed}`, `+${added}`]);
}

describe('parseDiff', () => {
  test('splits files and hunks and keeps added, removed and context lines', () => {
    const diff = [
      file('src/a.ts', [' const a = 1;', '-const b = 2;', '+const b = 3;']),
      file('src/b.ts', ['-// old', '+// new']),
    ].join('\n');
    expect(parseDiff(diff)).toEqual([
      {
        path: 'src/a.ts',
        hunks: [[
          { kind: 'context', text: 'const a = 1;', line: 1 },
          { kind: 'remove', text: 'const b = 2;', line: 2 },
          { kind: 'add', text: 'const b = 3;', line: 2 },
        ]],
      },
      {
        path: 'src/b.ts',
        hunks: [[
          { kind: 'remove', text: '// old', line: 1 },
          { kind: 'add', text: '// new', line: 1 },
        ]],
      },
    ]);
  });

  test('keeps an added line whose content starts with ++', () => {
    expect(parseDiff(file('src/a.ts', ['+++i;']))[0]?.hunks[0]).toEqual([{ kind: 'add', text: '++i;', line: 1 }]);
  });

  test('numbers each line on its own side across hunks', () => {
    const diff = ['diff --git a/src/a.ts b/src/a.ts', '@@ -10,2 +20,3 @@', ' keep', '-gone', '+one', '+two', '@@ -40 +51 @@', '-old', '+new'].join('\n');
    expect(parseDiff(diff)[0]?.hunks).toEqual([
      [
        { kind: 'context', text: 'keep', line: 20 },
        { kind: 'remove', text: 'gone', line: 11 },
        { kind: 'add', text: 'one', line: 21 },
        { kind: 'add', text: 'two', line: 22 },
      ],
      [
        { kind: 'remove', text: 'old', line: 40 },
        { kind: 'add', text: 'new', line: 51 },
      ],
    ]);
  });

  // A path with a quote or a tab makes git quote the header; dropping that
  // file would hide its lines from risk and the private-terms corpus.
  test('keeps the lines of a file whose header git quotes', () => {
    const diff = ['diff --git "a/src/a\\tb.ts" "b/src/a\\tb.ts"', '@@ -1 +1 @@', '-old', '+new'].join('\n');
    expect(parseDiff(diff)).toEqual([
      {
        path: '"a/src/a\\tb.ts" "b/src/a\\tb.ts"',
        hunks: [[{ kind: 'remove', text: 'old', line: 1 }, { kind: 'add', text: 'new', line: 1 }]],
      },
    ]);
  });
});

describe('changesBehavior', () => {
  const all = { includes: () => true };

  test('filters by the path the consumer owns', () => {
    const diff = parseDiff(diffFor('src/program.ts', 'const a = 1;', 'const a = 2;'));
    expect(changesBehavior(diff, { includes: (path) => path.startsWith('src/') })).toBe(true);
    expect(changesBehavior(diff, { includes: (path) => path.startsWith('bin/') })).toBe(false);
    expect(changesBehavior(diff, all)).toBe(true);
  });

  test('a line comment and a block comment are not behavior', () => {
    expect(changesBehavior(parseDiff(diffFor('src/a.ts', '// old', '// new')), all)).toBe(false);
    expect(changesBehavior(parseDiff(diffFor('src/a.ts', '/** old */', '/** new */')), all)).toBe(false);
    expect(
      changesBehavior(
        parseDiff(file('src/a.ts', ['-/* old', ' * old body', ' */', '+/* new', ' * new body', ' */'])),
        all,
      ),
    ).toBe(false);
  });

  test('code around a comment is behavior', () => {
    expect(
      changesBehavior(parseDiff(file('src/a.ts', ['-/* note */ const a = 1;', '+/* note */ const a = 2;'])), all),
    ).toBe(true);
  });

  test('a trimmed star that continues an expression is behavior', () => {
    expect(changesBehavior(parseDiff(diffFor('src/a.ts', 'const a = 1;', '  * 2;')), all)).toBe(true);
  });

  test('shell comments use # and JS code that starts with # stays behavior', () => {
    const shell = { includes: () => true, commentStyle: 'shell' as const };
    expect(changesBehavior(parseDiff(diffFor('scripts/verify.sh', '# old', '# new')), shell)).toBe(false);
    expect(changesBehavior(parseDiff(diffFor('scripts/verify.sh', 'echo old', 'echo new')), shell)).toBe(true);
    expect(changesBehavior(parseDiff(diffFor('src/a.ts', 'const x = 1;', '#private = 2;')), all)).toBe(true);
  });

  test('type-only changes count unless the consumer ignores them', () => {
    const added = file('src/types.ts', ['+export interface ApiHeaders {', '+  Mdapikey: string;', '+}']);
    expect(changesBehavior(parseDiff(added), all)).toBe(true);
    expect(changesBehavior(parseDiff(added), { includes: () => true, ignoreTypeOnly: true })).toBe(false);
    const pair = file('src/lib/api.ts', [
      '-function build(auth: AuthConfig): ApiHeaders {',
      '+function build(auth: AuthConfig): Record<string, string> {',
    ]);
    expect(changesBehavior(parseDiff(pair), { includes: () => true, ignoreTypeOnly: true })).toBe(false);
  });

  test('behaviorIndexes keeps only changed lines', () => {
    const hunk = parseDiff(file('src/a.ts', [' const a = 1;', '-const b = 2;', '+const b = 3;']))[0]!.hunks[0]!;
    expect([...behaviorIndexes(hunk)]).toEqual([1, 2]);
  });
});

describe('the three consumers agree on what changes behavior', () => {
  const commentOnly = diffFor('src/lib/api.ts', '// old note', '// new note');
  const behavior = diffFor('src/lib/api.ts', 'const headers = build();', 'const headers = build({});');

  test('a comment-only src change is not behavior for prova, the gate and risk', () => {
    expect(requiresProva(commentOnly)).toBe(false);
    expect(changesProduct(commentOnly)).toBe(false);
    expect(classifyRisk(commentOnly)).toEqual({ risky: false, reasons: [] });
  });

  test('a code change in a sensitive src file is behavior for all three', () => {
    expect(requiresProva(behavior)).toBe(true);
    expect(changesProduct(behavior)).toBe(true);
    expect(classifyRisk(behavior).risky).toBe(true);
  });
});
