import { readFileSync } from 'node:fs';
import { changesBehavior, parseDiff } from './behavior-change.js';
import { diffAgainst, parseBase } from './git.js';

export interface ProvaStatus {
  present: boolean;
  web: boolean;
  before: boolean;
  after: boolean;
}

export interface ProvaCheck {
  required: boolean;
  ok: boolean;
  status: ProvaStatus;
}

const PROVA_HEADING = /^##\s+Prova\s*$/i;
const SECTION_END = /^##\s+\S/;
const SUB_HEADING = /^#{2,3}\s+\S/;
const BEFORE_HEADING = /^###\s+Antes\s*\(main\)\s*$/i;
const AFTER_HEADING = /^###\s+Depois\s*\(branch\)\s*$/i;
const WEB_LINE = /^\s*Web:\s*\S/;
const NO_WEB_LINE = /^\s*sem equivalente na web\s*$/i;
const FENCE = /^\s*```/;

function sectionAfter(lines: string[], heading: RegExp): string[] | undefined {
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1) return undefined;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index++) {
    if (SECTION_END.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start + 1, end);
}

function subSection(lines: string[], heading: RegExp): string[] | undefined {
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1) return undefined;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index++) {
    if (SUB_HEADING.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start + 1, end);
}

function hasFilledFence(lines: string[]): boolean {
  let inFence = false;
  for (const line of lines) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence && line.trim() !== '') return true;
  }
  return false;
}

function hasWebReference(lines: string[]): boolean {
  return lines.some((line) => WEB_LINE.test(line) || NO_WEB_LINE.test(line));
}

export function parseProva(body: string): ProvaStatus {
  const section = sectionAfter(body.split('\n'), PROVA_HEADING);
  if (!section) return { present: false, web: false, before: false, after: false };
  const before = subSection(section, BEFORE_HEADING);
  const after = subSection(section, AFTER_HEADING);
  return {
    present: true,
    web: hasWebReference(section),
    before: before !== undefined && hasFilledFence(before),
    after: after !== undefined && hasFilledFence(after),
  };
}

const SRC_PATH = /^src(?:\/|$)/;

/** The proof is required only when a src/ change carries behavior, not a comment. */
export function requiresProva(diff: string): boolean {
  return changesBehavior(parseDiff(diff), { includes: (path) => SRC_PATH.test(path) });
}

export function checkProva(body: string, diff: string): ProvaCheck {
  const required = requiresProva(diff);
  const status = parseProva(body);
  return { required, ok: !required || (status.web && status.before && status.after), status };
}

interface Options {
  base: string;
  diff?: string;
  bodyFile?: string;
}

function parseOptions(argv: string[]): Options {
  const { base, rest } = parseBase(argv);
  const options: Options = { base };
  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index];
    if (arg === '--diff') {
      options.diff = rest[++index];
      if (!options.diff) throw new Error('--diff needs a file');
    } else if (arg === '--body-file') {
      options.bodyFile = rest[++index];
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

async function main(): Promise<void> {
  try {
    const options = parseOptions(process.argv.slice(2));
    const body = options.bodyFile ? readFileSync(options.bodyFile, 'utf8') : (process.env.PR_BODY ?? '');
    const diff = options.diff ? readFileSync(options.diff, 'utf8') : await diffAgainst(options.base, { paths: ['src'] });
    const check = checkProva(body, diff);

    if (!check.required) {
      console.log('prova: not required (no src/ behavior change)');
      return;
    }
    if (check.ok) {
      console.log('prova: filled with the web evidence, before (main) and after (branch)');
      return;
    }

    const missing: string[] = [];
    if (!check.status.present) missing.push('the "## Prova" section');
    if (!check.status.web) {
      missing.push('a "Web:" line with the bundle snippet (or "sem equivalente na web")');
    }
    if (!check.status.before) missing.push('a filled code block under "### Antes (main)"');
    if (!check.status.after) missing.push('a filled code block under "### Depois (branch)"');
    console.error(`prova: this PR changes src/ and needs ${missing.join(', ')}.`);
    console.error('prova: cite the web bundle ($HOME/.mdcli-team/ref/mdb.js) or say there is no web equivalent.');
    console.error('prova: run the commands against the mock (scripts/mock-api.ts), never a real account.');
    process.exitCode = 1;
  } catch (error) {
    console.error(`prova: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) await main();
