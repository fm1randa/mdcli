import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { classifyRisk, securityDetail } from '../scripts/risk.js';

const root = join(import.meta.dir, '..');

// The commands verify.sh and CI run for the private-data guard.
const GUARD_ENTRIES = ['scripts/private-terms-cli.ts', 'scripts/private-terms-corpus.ts', 'scripts/check-private-messages.ts'];

// Not a security surface on purpose: AGENTS.md (Private data) sends non-account
// values there with a reason, and the corpus step still checks what it holds.
const NOT_SURFACES = new Set(['scripts/private-terms-excused.ts']);

const transpiler = new Bun.Transpiler({ loader: 'ts' });

/** Every repository module the guard entry points load at runtime, entry points included. */
function guardModules(): string[] {
  const seen = new Set<string>();
  const queue = [...GUARD_ENTRIES];
  while (queue.length > 0) {
    const path = queue.pop()!;
    if (seen.has(path)) continue;
    seen.add(path);
    for (const { path: specifier } of transpiler.scanImports(readFileSync(join(root, path), 'utf8'))) {
      if (!specifier.startsWith('.')) continue;
      const target = relative(root, join(root, dirname(path), specifier)).replace(/\.js$/, '.ts');
      queue.push(target);
    }
  }
  return [...seen].sort();
}

describe('private-data guard imports', () => {
  test('walks into the src helper the guard parses git output with', () => {
    const modules = guardModules();
    expect(modules).toContain('scripts/private-terms.ts');
    expect(modules).toContain('src/utils/parse.ts');
  });

  test('every module the guard loads is a security surface', () => {
    const unguarded = guardModules().filter((path) => !NOT_SURFACES.has(path) && securityDetail(path) === undefined);
    expect(unguarded).toEqual([]);
  });

  test('flags a behavior change in src/utils/parse.ts as security', () => {
    const diff = readFileSync(join(import.meta.dir, 'fixtures', 'risk', 'guard-helper-surface.diff'), 'utf8');
    expect(classifyRisk(diff)).toEqual({
      risky: true,
      reasons: [{ topic: 'security', path: 'src/utils/parse.ts', detail: 'parse helper the private-data guard imports changed' }],
    });
  });
});
