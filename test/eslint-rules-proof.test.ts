import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ESLint, Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import local from '../eslint-rules/index.js';
import { git, revisionExists } from '../scripts/git.js';
import { commitAll } from './git-repo.js';

// Every local rule must prove two things in CI: it catches the code that
// motivated it (a `before` fixture from that commit), and the config enables
// it on the default src/** + test/** + scripts/** scope unless a named
// exemption says no. Each area is probed through one file no block ignores, so
// dropping an area from a block's `files` leaves a gap this test reports (#272).
const ROOT = join(import.meta.dir, '..');
const FIXTURES = join(import.meta.dir, 'fixtures/lint-rules');
const RULE_AREAS = {
  'src/**': 'src/lib/api.ts',
  'test/**': 'test/helpers.ts',
  'scripts/**': 'scripts/risk.ts',
} as const;

const eslint = new ESLint({ cwd: ROOT });
const linter = new Linter();
const rules = Object.keys(local.rules).sort();

interface Fixture {
  rule: string;
  origin: string;
  source: string;
  note: string;
  code: string;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

const fixtures = new Map<string, Fixture>();
for (const file of readdirSync(FIXTURES).filter((name) => name.endsWith('.before.json'))) {
  const fixture = readJson<Fixture>(join(FIXTURES, file));
  fixtures.set(fixture.rule, fixture);
}

const exemptions = readJson<Record<string, Record<string, string>>>(join(ROOT, 'eslint-rules/scope-exemptions.json'));

function testSources(): string[] {
  const entries = readdirSync(join(ROOT, 'test'), { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.ts'))
    .map((entry) => readFileSync(join(entry.parentPath, entry.name), 'utf8'));
}

const sources = testSources();

function hasDescribe(rule: string): boolean {
  const pattern = new RegExp(`describe\\(\\s*['"\`]local/${rule}['"\`]`);
  return sources.some((source) => pattern.test(source));
}

function normalize(source: string): string {
  return source.split('\n').map((line) => line.trim()).filter((line) => line !== '').join('\n');
}

async function mainRef(cwd: string): Promise<string> {
  for (const ref of ['origin/main', 'main']) {
    if (await revisionExists(`${ref}^{commit}`, cwd)) return ref;
  }
  throw new Error('cannot verify fixture origins without origin/main or main; fetch the main history');
}

// A fixture whose origin survives only on the PR branch passes this checkout
// but disappears when the squash merge rewrites that branch, leaving main red.
// Requiring the origin to be in main's history refuses it before the merge.
async function assertReachable(rule: string, origin: string, cwd = ROOT): Promise<void> {
  const base = await mainRef(cwd);
  try {
    await git(['merge-base', '--is-ancestor', origin, base], cwd);
  } catch {
    throw new Error(`${rule}: fixture origin ${origin} is not reachable from ${base}; the squash merge drops branch-only commits, so anchor the fixture in a commit already on main`);
  }
}

// The fixture proves the rule catches real code only when that code is still
// in the commit that motivated the rule. A hand-written approximation lets a
// narrow selector pass while missing the shape it was built for.
async function assertOriginCode(rule: string, fixture: Fixture): Promise<void> {
  if (!(await revisionExists(`${fixture.origin}^{commit}`, ROOT))) {
    throw new Error(`${rule}: fixture origin ${fixture.origin} is not a commit in this repository`);
  }
  await assertReachable(rule, fixture.origin);
  let blob: string;
  try {
    blob = await git(['show', `${fixture.origin}:${fixture.source}`], ROOT);
  } catch {
    throw new Error(`${rule}: ${fixture.source} does not exist at ${fixture.origin}`);
  }
  if (!normalize(blob).includes(normalize(fixture.code))) {
    throw new Error(`${rule}: fixture code is not verbatim from ${fixture.origin}:${fixture.source}`);
  }
}

async function enabledOn(rule: string, filePath: string): Promise<boolean> {
  const config = await eslint.calculateConfigForFile(filePath);
  return config?.rules?.[`local/${rule}`] !== undefined;
}

describe('every local rule is proven against the code that motivated it', () => {
  test('eslint-rules/index.js lists the rules the fixtures cover', () => {
    expect(rules.length).toBeGreaterThan(0);
    expect([...fixtures.keys()].sort()).toEqual(rules);
  });

  for (const rule of rules) {
    test(`${rule} has a describe and a before fixture from a real commit`, async () => {
      const fixture = fixtures.get(rule);
      expect(fixture).toBeDefined();
      expect(hasDescribe(rule)).toBe(true);
      expect(fixture!.origin).toMatch(/^[0-9a-f]{7,40}\^?$/);
      expect(fixture!.note.trim()).not.toBe('');
      expect(existsSync(join(ROOT, fixture!.source))).toBe(true);
      await assertOriginCode(rule, fixture!);

      // A plain Linter keeps this check off the typed-project startup in
      // eslint-local-rules.test.ts; the scope is proven by calculateConfigForFile above.
      const messages = linter.verify(fixture!.code, [{
        files: ['**/*.ts'],
        plugins: { local },
        languageOptions: { parser: tseslint.parser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module' } },
        rules: { [`local/${rule}`]: 'error' },
      }], { filename: fixture!.source });
      expect(messages.filter((message) => message.ruleId === `local/${rule}`).length).toBeGreaterThan(0);
    });
  }

  test('the scope table names a default area only when the rule is off there', async () => {
    const gaps: string[] = [];
    for (const rule of rules) {
      for (const [area, sample] of Object.entries(RULE_AREAS)) {
        const enabled = await enabledOn(rule, sample);
        const exempt = exemptions[rule]?.[area] !== undefined;
        if (!enabled && !exempt) gaps.push(`${rule} is off on ${area} with no named exemption`);
        if (enabled && exempt) gaps.push(`${rule} is enabled on ${area}, so its exemption is stale`);
      }
    }
    expect(gaps).toEqual([]);
  });

  test('no exemption names an unknown rule, area or empty reason', () => {
    for (const [rule, areas] of Object.entries(exemptions)) {
      expect(rules).toContain(rule);
      for (const [area, reason] of Object.entries(areas)) {
        expect(Object.keys(RULE_AREAS)).toContain(area);
        expect(reason.trim()).not.toBe('');
      }
    }
  });
});

describe('fixture origins survive the squash merge', () => {
  test('accepts a commit on main and rejects one only on a side branch', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'mdcli-fixture-origin-'));
    try {
      const commit = (message: string): Promise<string> => commitAll(repo, message, '--allow-empty');
      await git(['init', '-q', '-b', 'main'], repo);
      const mainCommit = await commit('main');
      await git(['update-ref', 'refs/remotes/origin/main', mainCommit], repo);
      await git(['checkout', '-q', '-b', 'feature'], repo);
      const sideCommit = await commit('side');

      await expect(assertReachable('rule', mainCommit, repo)).resolves.toBeUndefined();
      await expect(assertReachable('rule', sideCommit, repo)).rejects.toThrow(/not reachable from origin\/main/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
