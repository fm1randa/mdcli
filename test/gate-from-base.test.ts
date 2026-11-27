import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workflows = join(import.meta.dir, '..', '.github', 'workflows');
const GATE_BASE = '${{ runner.temp }}/gate';

interface Step {
  name?: string;
  run?: string;
  env?: Record<string, string>;
}

interface Workflow {
  jobs: Record<string, { steps: Step[] }>;
}

function steps(file: string): Step[] {
  const workflow = Bun.YAML.parse(readFileSync(join(workflows, file), 'utf8')) as Workflow;
  return Object.values(workflow.jobs).flatMap((job) => job.steps);
}

function stepRunning(file: string, script: string): Step | undefined {
  return steps(file).find((candidate) => candidate.run?.includes(`scripts/${script}`) === true);
}

function prepareStep(file: string): Step | undefined {
  return steps(file).find((candidate) => candidate.run?.includes('git worktree add --detach') === true);
}

function expectGateFromBase(file: string, script: string): void {
  const prepare = prepareStep(file);
  expect(prepare?.run ?? '').toContain('git worktree add --detach');
  expect(prepare?.run ?? '').toContain('origin/');

  const gate = stepRunning(file, script);
  expect(gate?.env?.GATE_BASE).toBe(GATE_BASE);
  expect(gate?.run ?? '').toContain(`bun "$GATE_BASE/scripts/${script}"`);
  expect(gate?.run ?? '').not.toContain(`bun scripts/${script}`);
}

describe('gate scripts come from the base branch', () => {
  test('the risco workflow checks the base scripts out in a worktree', () => {
    expectGateFromBase('risco.yml', 'risk.ts');
    expect(stepRunning('risco.yml', 'risk-label.ts')?.run ?? '').toContain(
      'bun "$GATE_BASE/scripts/risk-label.ts"'
    );
    expect(prepareStep('risco.yml')?.run ?? '').toContain('origin/$BASE_REF');
  });

  test('the risco workflow installs the dependencies the base gate imports (#357)', () => {
    // scripts/write-surface.ts imports typescript; without node_modules in the
    // base worktree the gate exits 1 on every pull request.
    expect(prepareStep('risco.yml')?.run ?? '').toContain('bun install --frozen-lockfile --cwd "$GATE_BASE"');
  });

  test('the fails-on-main workflow checks the base gate out in a worktree', () => {
    expectGateFromBase('fails-on-main.yml', 'new-tests-fail-on-main.ts');
    expect(prepareStep('fails-on-main.yml')?.run ?? '').toContain('origin/main');
  });

  test('the prova workflow checks the base gate out in a worktree', () => {
    expectGateFromBase('prova.yml', 'prova.ts');
    expect(prepareStep('prova.yml')?.run ?? '').toContain('origin/main');
  });
});
