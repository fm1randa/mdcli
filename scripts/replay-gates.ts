import { parseInteger } from '../src/utils/parse.js';
import { decideGate } from './fails-on-main-exemption.js';
import { changesProduct } from './new-tests-fail-on-main.js';
import { checkProva } from './prova.js';
import { classifyRisk, type RiskReason } from './risk.js';

export interface CommitInput {
  sha: string;
  subject: string;
  body: string;
  diff: string;
  nameStatus: string;
}

export interface GateDecision {
  gate: string;
  fired: boolean;
  detail: string;
}

export interface Gate {
  name: string;
  decide(commit: CommitInput): GateDecision;
}

export interface CommitReplay {
  sha: string;
  subject: string;
  decisions: GateDecision[];
}

export interface ReplayReport {
  commits: CommitReplay[];
  fired: number;
  skipped: number;
}

function riskDetail(reasons: readonly RiskReason[]): string {
  return reasons.map((reason) => `${reason.path} (${reason.topic}): ${reason.detail}`).join('; ');
}

const RISK_GATE: Gate = {
  name: 'risk',
  decide(commit) {
    const report = classifyRisk(commit.diff);
    if (!report.risky) {
      return {
        gate: 'risk',
        fired: false,
        detail: 'safe: no authentication, session, credential, data write or security surface change',
      };
    }
    return { gate: 'risk', fired: true, detail: riskDetail(report.reasons) };
  },
};

const FAILS_ON_MAIN_GATE: Gate = {
  name: 'fails-on-main',
  decide(commit) {
    const decision = decideGate(changesProduct(commit.diff), commit.subject, commit.body);
    if (decision.kind === 'not-required') {
      return {
        gate: 'fails-on-main',
        fired: false,
        detail: 'not required: the diff does not change src/ or bin/',
      };
    }
    if (decision.kind === 'exempt') {
      return {
        gate: 'fails-on-main',
        fired: false,
        detail: `exempt from the ${decision.source}: ${decision.reason}`,
      };
    }
    if (decision.kind === 'invalid-exemption') {
      return { gate: 'fails-on-main', fired: true, detail: `required: ${decision.reason}` };
    }
    return {
      gate: 'fails-on-main',
      fired: true,
      detail: 'required: the diff changes src/ or bin/ and no exemption applies',
    };
  },
};

function missingProva(check: ReturnType<typeof checkProva>): string[] {
  const missing: string[] = [];
  if (!check.status.present) missing.push('the "## Prova" section');
  if (!check.status.web) missing.push('a "Web:" line');
  if (!check.status.before) missing.push('a filled "### Antes (main)" block');
  if (!check.status.after) missing.push('a filled "### Depois (branch)" block');
  return missing;
}

const PROVA_GATE: Gate = {
  name: 'prova',
  decide(commit) {
    const check = checkProva(commit.body, commit.diff);
    if (!check.required) {
      return { gate: 'prova', fired: false, detail: 'not required: no src/ behavior change' };
    }
    if (check.ok) {
      return { gate: 'prova', fired: true, detail: 'required: the body fills the proof' };
    }
    return { gate: 'prova', fired: true, detail: `required and missing ${missingProva(check).join(', ')}` };
  },
};

/** The registry a new gate joins, with its own decide() over a commit. */
export const GATES: readonly Gate[] = [RISK_GATE, FAILS_ON_MAIN_GATE, PROVA_GATE];

export function replayGates(commits: readonly CommitInput[], gates: readonly Gate[] = GATES): ReplayReport {
  const replayed = commits.map((commit) => ({
    sha: commit.sha,
    subject: commit.subject,
    decisions: gates.map((gate) => gate.decide(commit)),
  }));
  const decisions = replayed.flatMap((commit) => commit.decisions);
  const fired = decisions.filter((decision) => decision.fired).length;
  return { commits: replayed, fired, skipped: decisions.length - fired };
}

function git(args: string[], root: string): string {
  const result = Bun.spawnSync(['git', ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.toString().trim()}`);
  }
  return result.stdout.toString();
}

function gitQuiet(args: string[], root: string): string | undefined {
  const result = Bun.spawnSync(['git', ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
  return result.exitCode === 0 ? result.stdout.toString().trim() : undefined;
}

export function defaultRevision(root: string): string {
  for (const candidate of ['origin/main', 'main', 'HEAD']) {
    if (gitQuiet(['rev-parse', '--verify', '--quiet', candidate], root) !== undefined) return candidate;
  }
  throw new Error('no origin/main, main or HEAD revision found');
}

/**
 * The last `count` commits on the trunk line, each with the diff against its
 * first parent. A squash merge has one parent; `--first-parent` keeps the
 * replay on the commits that actually landed on the trunk.
 */
export function readCommits(rev: string, count: number, root: string): CommitInput[] {
  const shas = git(['log', '--first-parent', '-n', String(count), '--format=%H', rev], root)
    .split('\n')
    .filter((line) => line !== '');
  const commits: CommitInput[] = [];
  for (const sha of shas) {
    const parent = gitQuiet(['rev-parse', '--verify', '--quiet', `${sha}^`], root);
    if (parent === undefined) continue;
    commits.push({
      sha,
      subject: git(['log', '-1', '--format=%s', sha], root).trim(),
      body: git(['log', '-1', '--format=%b', sha], root),
      diff: git(['diff', '--no-renames', '--no-color', parent, sha], root),
      nameStatus: git(['diff', '--name-status', '--no-renames', parent, sha], root),
    });
  }
  return commits;
}

interface Options {
  rev?: string;
  commits: number;
  gates: string[];
  json: boolean;
}

const DEFAULT_COMMITS = 10;

function parseOptions(argv: string[]): Options {
  const options: Options = { commits: DEFAULT_COMMITS, gates: [], json: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--rev') {
      const rev = argv[++index];
      if (rev === undefined) throw new Error('--rev needs a revision');
      options.rev = rev;
    } else if (arg === '--commits') {
      const count = parseInteger(argv[++index] ?? '', 1);
      if (count === undefined) throw new Error('--commits needs a whole number of at least 1');
      options.commits = count;
    } else if (arg === '--gate') {
      const name = argv[++index];
      if (name === undefined) throw new Error('--gate needs a name');
      options.gates.push(name);
    } else if (arg === '--json') {
      options.json = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

function selectGates(names: readonly string[]): Gate[] {
  if (names.length === 0) return [...GATES];
  const selected: Gate[] = [];
  for (const name of names) {
    const gate = GATES.find((candidate) => candidate.name === name);
    if (gate === undefined) {
      throw new Error(`unknown gate: ${name} (known: ${GATES.map((candidate) => candidate.name).join(', ')})`);
    }
    if (!selected.includes(gate)) selected.push(gate);
  }
  return selected;
}

function format(report: ReplayReport, rev: string): string {
  const lines = [`replay-gates: ${report.commits.length} commits from ${rev}`];
  for (const commit of report.commits) {
    lines.push(`${commit.sha.slice(0, 7)} ${commit.subject}`);
    for (const decision of commit.decisions) {
      lines.push(`  ${decision.gate}: ${decision.fired ? 'FIRED' : 'skipped'} (${decision.detail})`);
    }
  }
  lines.push(`replay-gates: ${report.fired} fired, ${report.skipped} skipped`);
  return lines.join('\n');
}

function main(): void {
  try {
    const options = parseOptions(process.argv.slice(2));
    const root = git(['rev-parse', '--show-toplevel'], process.cwd()).trim();
    const rev = options.rev ?? defaultRevision(root);
    const report = replayGates(readCommits(rev, options.commits, root), selectGates(options.gates));
    console.log(options.json ? JSON.stringify({ rev, ...report }, null, 2) : format(report, rev));
  } catch (error) {
    console.error(`replay-gates: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) main();
