import { readFileSync } from 'node:fs';
import type { RiskReport } from './risk.js';
import { spawn } from './git.js';

export const RISK_LABEL = 'risco';

export type LabelAction = 'add' | 'remove' | 'keep';

export function planLabelAction(risky: boolean, labels: readonly string[]): LabelAction {
  const labeled = labels.includes(RISK_LABEL);
  if (risky) return labeled ? 'keep' : 'add';
  return labeled ? 'remove' : 'keep';
}

interface Options {
  report: string;
  labels: string;
  apply: boolean;
  pr?: string;
  json: boolean;
}

function parseOptions(argv: string[]): Options {
  const options: Options = { report: '', labels: '[]', apply: false, json: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--report') {
      options.report = argv[++index] ?? '';
    } else if (arg === '--labels') {
      options.labels = argv[++index] ?? '[]';
    } else if (arg === '--pr') {
      options.pr = argv[++index];
    } else if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--json') {
      options.json = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (options.report === '') throw new Error('--report <file> is required');
  if (options.apply && !options.pr) throw new Error('--apply needs --pr <number>');
  return options;
}

function parseReport(path: string): RiskReport {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof value !== 'object' || value === null) throw new Error('the report must be an object');
  const candidate = value as { risky?: unknown; reasons?: unknown };
  if (typeof candidate.risky !== 'boolean' || !Array.isArray(candidate.reasons)) {
    throw new Error('the report must carry risky and reasons');
  }
  return value as RiskReport;
}

function parseLabels(raw: string): string[] {
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || !value.every((label) => typeof label === 'string')) {
    throw new Error('--labels must be a JSON array of strings');
  }
  return value;
}

interface CommandResult {
  ok: boolean;
  output: string;
}

async function gh(args: string[]): Promise<CommandResult> {
  const result = await spawn(['gh', ...args]);
  const output = `${result.stdout.toString()}${result.stderr.toString()}`.trim();
  return { ok: result.exitCode === 0, output };
}

async function ensureLabel(repo: string): Promise<boolean> {
  if ((await gh(['api', `repos/${repo}/labels/${RISK_LABEL}`, '--silent'])).ok) return true;
  const created = await gh([
    'api',
    '--method',
    'POST',
    `repos/${repo}/labels`,
    '-f',
    `name=${RISK_LABEL}`,
    '-f',
    'color=B60205',
    '-f',
    'description=PR arriscado: exige /blast-radius e decisão do mantenedor',
  ]);
  if (!created.ok) {
    console.error(`risk-label: could not create the repository label: ${created.output}`);
    console.error('risk-label: create it once with `gh label create risco --color B60205 --description "..."`.');
  }
  return created.ok;
}

async function applyAction(action: LabelAction, pr: string): Promise<boolean> {
  if (action === 'keep') return true;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error('GITHUB_REPOSITORY is required with --apply');
  if (action === 'add' && !(await ensureLabel(repo))) return false;
  const flag = action === 'add' ? '--add-label' : '--remove-label';
  const edited = await gh(['pr', 'edit', pr, flag, RISK_LABEL]);
  if (!edited.ok) console.error(`risk-label: gh pr edit failed: ${edited.output}`);
  return edited.ok;
}

function labelStatus(action: LabelAction, apply: boolean, applied: boolean): string {
  if (action === 'keep') return 'unchanged';
  if (!apply) return 'not changed (fork PR: the token cannot write labels)';
  if (!applied) return 'not changed (see the job log)';
  return action === 'add' ? 'added' : 'removed';
}

function summary(report: RiskReport, action: LabelAction, apply: boolean, applied: boolean): string {
  const lines = ['## Risk', ''];
  if (report.risky) {
    lines.push('Risky: the diff touches authentication, session, credentials, data writes, or a security surface.', '');
    for (const reason of report.reasons) {
      lines.push(`- \`${reason.path}\` (${reason.topic}): ${reason.detail}`);
    }
  } else {
    lines.push('Safe: no authentication, session, credentials, data write, or security surface change.');
  }
  lines.push('', `Label \`${RISK_LABEL}\`: ${labelStatus(action, apply, applied)}.`);
  return lines.join('\n');
}

async function main(): Promise<void> {
  try {
    const options = parseOptions(process.argv.slice(2));
    const report = parseReport(options.report);
    const labels = parseLabels(options.labels);
    const action = planLabelAction(report.risky, labels);

    if (options.json) {
      console.log(JSON.stringify({ action, risky: report.risky }));
      return;
    }

    const applied = options.apply ? await applyAction(action, options.pr as string) : false;
    console.log(summary(report, action, options.apply, applied));
    if (options.apply && !applied) process.exitCode = 1;
  } catch (error) {
    console.error(`risk-label: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) await main();
