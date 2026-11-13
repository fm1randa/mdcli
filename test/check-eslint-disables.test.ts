import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { countDisables, directiveLines } from '../scripts/check-eslint-disables.js';
import type { ContentReader } from '../scripts/check-eslint-disables.js';
import { git } from '../scripts/git.js';
import { commitAll } from './git-repo.js';
import { run } from './run.js';

const HEADER = `diff --git a/src/lib/x.ts b/src/lib/x.ts
index 1111111..2222222 100644
--- a/src/lib/x.ts
+++ b/src/lib/x.ts
`;

function reader(files: Record<string, string>): ContentReader {
  return (path) => files[path];
}

describe('directiveLines', () => {
  test('reads a directive only when it is a comment', () => {
    const content = [
      '// eslint-disable-next-line local/no-raw-dash',
      'const s = `',
      '// eslint-disable-next-line local/no-raw-dash',
      '`;',
      'const a = 1; // eslint-disable-line local/no-raw-dash',
      '/* eslint-disable local/no-raw-dash */',
    ].join('\n');
    expect(directiveLines(content)).toEqual(new Set([1, 5, 6]));
  });
});

describe('countDisables', () => {
  test('names an added directive with its line in the new file', () => {
    const diff = `${HEADER}@@ -3,0 +4,2 @@
+  // eslint-disable-next-line local/no-raw-dash
+  export const s = 1;
`;
    const files = {
      'src/lib/x.ts': 'const a = 1;\nconst b = 2;\nconst c = 3;\n  // eslint-disable-next-line local/no-raw-dash\nexport const s = 1;\n',
    };
    expect(countDisables(diff, reader(files))).toEqual({
      added: [
        {
          path: 'src/lib/x.ts',
          line: 4,
          text: '  // eslint-disable-next-line local/no-raw-dash',
          hasReason: false,
        },
      ],
      removed: 0,
      undocumented: [
        {
          path: 'src/lib/x.ts',
          line: 4,
          text: '  // eslint-disable-next-line local/no-raw-dash',
          hasReason: false,
        },
      ],
    });
  });

  test('ignores a directive inside a string and a markdown mention', () => {
    const diff = `${HEADER}@@ -1,0 +2,1 @@
+// eslint-disable-next-line local/no-raw-dash
diff --git a/REVIEW.md b/REVIEW.md
--- a/REVIEW.md
+++ b/REVIEW.md
@@ -1,0 +2,1 @@
+the copied \`eslint-disable-next-line\` is the problem
`;
    const files = { 'src/lib/x.ts': 'const s = `\n// eslint-disable-next-line local/no-raw-dash\n`;\n' };
    expect(countDisables(diff, reader(files))).toEqual({ added: [], removed: 0, undocumented: [] });
  });

  test('counts a removed directive from the old side', () => {
    const diff = `${HEADER}@@ -8 +9,0 @@
-  // eslint-disable-next-line local/no-raw-dash
`;
    const files = { 'src/lib/x.ts': 'line1\nline2\nline3\nline4\nline5\nline6\nline7\n  // eslint-disable-next-line local/no-raw-dash\n' };
    expect(countDisables(diff, reader(files))).toEqual({ added: [], removed: 1, undocumented: [] });
  });

  test('a reason after "--" makes an added directive documented', () => {
    const diff = `${HEADER}@@ -3,0 +4,1 @@
+// eslint-disable-next-line local/no-raw-dash -- the column value is a dash here
`;
    const files = {
      'src/lib/x.ts':
        'const a = 1;\nconst b = 2;\nconst c = 3;\n// eslint-disable-next-line local/no-raw-dash -- the column value is a dash here\n',
    };
    expect(countDisables(diff, reader(files))).toEqual({
      added: [
        {
          path: 'src/lib/x.ts',
          line: 4,
          text: '// eslint-disable-next-line local/no-raw-dash -- the column value is a dash here',
          hasReason: true,
        },
      ],
      removed: 0,
      undocumented: [],
    });
  });

  test('removing one directive does not excuse an added directive without a reason', () => {
    const diff = `diff --git a/src/lib/a.ts b/src/lib/a.ts
--- a/src/lib/a.ts
+++ b/src/lib/a.ts
@@ -2 +2,0 @@
-// eslint-disable-next-line local/no-raw-dash -- legacy
diff --git a/src/lib/b.ts b/src/lib/b.ts
--- a/src/lib/b.ts
+++ b/src/lib/b.ts
@@ -1,0 +1,1 @@
+// eslint-disable-next-line local/no-raw-dash
`;
    const files = {
      'src/lib/a.ts': 'const a = 1;\n// eslint-disable-next-line local/no-raw-dash -- legacy\n',
      'src/lib/b.ts': '// eslint-disable-next-line local/no-raw-dash\n',
    };
    const count = countDisables(diff, reader(files));
    expect(count.removed).toBe(1);
    expect(count.undocumented.map((directive) => `${directive.path}:${directive.line}`)).toEqual(['src/lib/b.ts:1']);
  });
});

describe('check-eslint-disables step', () => {
  test('fails when the diff deletes one disable and copies another without a reason', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'mdcli-disables-'));
    const script = join(import.meta.dir, '..', 'scripts', 'check-eslint-disables.ts');
    try {
      mkdirSync(join(repo, 'src'), { recursive: true });
      writeFileSync(
        join(repo, 'src', 'a.ts'),
        'const a = 1;\n// eslint-disable-next-line local/no-raw-dash -- legacy\n'
      );
      await git(['init', '-q'], repo);
      await commitAll(repo, 'base');

      writeFileSync(join(repo, 'src', 'a.ts'), 'const a = 1;\n');
      writeFileSync(join(repo, 'src', 'b.ts'), '// eslint-disable-next-line local/no-raw-dash\nexport const b = 1;\n');
      await commitAll(repo, 'delete one, copy another');

      const result = await run(['bun', script, '--base', 'HEAD~1', '--head', 'HEAD'], { cwd: repo });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('sem motivo depois de "--"');
      expect(result.stderr).toContain('src/b.ts:1');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  // The gate diffed base against the files on disk with two dots, so a branch
  // behind main read a bare directive main had removed as one it added (#286).
  test('passes a branch behind main and fails on its own uncommitted bare directive', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'mdcli-disables-behind-'));
    const script = join(import.meta.dir, '..', 'scripts', 'check-eslint-disables.ts');
    const check = () => run(['bun', script, '--base', 'main'], { cwd: repo });
    try {
      mkdirSync(join(repo, 'src'), { recursive: true });
      writeFileSync(join(repo, 'src', 'a.ts'), '// eslint-disable-next-line local/no-raw-dash\nexport const a = 1;\n');
      await git(['init', '-q', '-b', 'main'], repo);
      await commitAll(repo, 'base');
      await git(['checkout', '-q', '-b', 'feature'], repo);
      await git(['checkout', '-q', 'main'], repo);
      writeFileSync(join(repo, 'src', 'a.ts'), 'export const a = 1;\n');
      await commitAll(repo, 'main drops the bare directive');
      await git(['checkout', '-q', 'feature'], repo);

      const behind = await check();
      expect(behind.stderr).toBe('');
      expect(behind.exitCode).toBe(0);

      writeFileSync(join(repo, 'src', 'b.ts'), '// eslint-disable-next-line local/no-raw-dash\nexport const b = 1;\n');
      await git(['add', 'src/b.ts'], repo);
      const uncommitted = await check();
      expect(uncommitted.exitCode).toBe(1);
      expect(uncommitted.stderr).toContain('src/b.ts:1');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
