import { describe, expect, test } from 'bun:test';
import { countDisables, directiveLines } from '../scripts/check-eslint-disables.js';
import type { ContentReader } from '../scripts/check-eslint-disables.js';

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
      added: [{ path: 'src/lib/x.ts', line: 4, text: '  // eslint-disable-next-line local/no-raw-dash' }],
      removed: 0,
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
    expect(countDisables(diff, reader(files))).toEqual({ added: [], removed: 0 });
  });

  test('counts a removed directive from the old side', () => {
    const diff = `${HEADER}@@ -8 +9,0 @@
-  // eslint-disable-next-line local/no-raw-dash
`;
    const files = { 'src/lib/x.ts': 'line1\nline2\nline3\nline4\nline5\nline6\nline7\n  // eslint-disable-next-line local/no-raw-dash\n' };
    expect(countDisables(diff, reader(files))).toEqual({ added: [], removed: 1 });
  });
});
