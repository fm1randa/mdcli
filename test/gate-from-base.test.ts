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

function step(file: string, name: string): Step | undefined {
  return steps(file).find((candidate) => candidate.name === name);
}

describe('gate scripts come from the base branch', () => {
  test('the risco workflow checks the base scripts out in a worktree', () => {
    const prepare = step('risco.yml', 'Check out the gate scripts from the base branch');
    expect(prepare?.run ?? '').toContain('git worktree add --detach "$GATE_BASE" "origin/$BASE_REF"');

    const classify = step('risco.yml', 'Classificar o diff e sincronizar a label `risco`');
    expect(classify?.env?.GATE_BASE).toBe(GATE_BASE);
    expect(classify?.run ?? '').toContain('bun "$GATE_BASE/scripts/risk.ts"');
    expect(classify?.run ?? '').toContain('bun "$GATE_BASE/scripts/risk-label.ts"');
    expect(classify?.run ?? '').not.toMatch(/bun scripts\/risk/);
  });

  test('the fails-on-main workflow checks the base gate out in a worktree', () => {
    const prepare = step('fails-on-main.yml', 'Check out the gate scripts from the base branch');
    expect(prepare?.run ?? '').toContain('git worktree add --detach "$GATE_BASE" origin/main');

    const gate = step('fails-on-main.yml', 'Every new or changed test must fail against origin/main');
    expect(gate?.env?.GATE_BASE).toBe(GATE_BASE);
    expect(gate?.run ?? '').toContain('bun "$GATE_BASE/scripts/new-tests-fail-on-main.ts"');
    expect(gate?.run ?? '').not.toMatch(/bun scripts\/new-tests-fail-on-main/);
  });
});
