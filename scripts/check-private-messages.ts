import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_BASE, spawnAsync } from './git.js';
import { KEYED_TERM_HASHES, requirePrivateTermsKey, scanText } from './private-terms.js';

export interface MessageSource {
  label: string;
  text: string;
}

export interface MessageHit {
  label: string;
  lines: number[];
}

export function messageHits(
  sources: MessageSource[],
  terms?: ReadonlySet<string>,
  allowed?: ReadonlySet<string>,
  keyed?: ReadonlySet<string>,
  key?: string
): MessageHit[] {
  const hits: MessageHit[] = [];
  for (const source of sources) {
    const lines = scanText(source.text, terms, allowed, keyed, key);
    if (lines.length > 0) hits.push({ label: source.label, lines });
  }
  return hits;
}

export async function commitSources(base: string, root: string = join(import.meta.dirname, '..')): Promise<MessageSource[]> {
  // Async: this runs inside `bun test --parallel`, where spawnSync can hang (see spawnAsync).
  const { stdout, stderr, exitCode } = await spawnAsync(
    ['git', '--no-pager', 'log', `${base}..HEAD`, '--format=%H%x00%B%x00'],
    { cwd: root }
  );
  if (exitCode !== 0) throw new Error(`git log ${base}..HEAD failed: ${stderr.trim()}`);
  const parts = stdout.split('\0');
  const sources: MessageSource[] = [];
  // git joins records with a newline, so the next record's SHA carries it.
  for (let index = 0; index + 1 < parts.length; index += 2) {
    const sha = parts[index]!.trim();
    if (sha === '') continue;
    sources.push({ label: `commit ${sha.slice(0, 7)}`, text: parts[index + 1]! });
  }
  return sources;
}

// `gh pr view` reaches the GitHub API, and on a slow network it has taken over
// ten seconds. A shorter deadline silently drops the body, so leave headroom.
const GH_TIMEOUT_MS = 30_000;

export async function pullRequestSource(): Promise<MessageSource | undefined> {
  const body = process.env.PR_BODY;
  if (body !== undefined) return body.trim() === '' ? undefined : { label: 'PR body', text: body };
  const command = ['gh', 'pr', 'view', '--json', 'body'];
  try {
    const { stdout, stderr, exitCode } = await spawnAsync(command, { timeout: GH_TIMEOUT_MS });
    if (exitCode !== 0) {
      console.error(`private-data: gh pr view failed (${stderr.trim() || `exit ${exitCode}`}); PR body not checked`);
      return undefined;
    }
    const parsed = JSON.parse(stdout) as { body?: unknown };
    const text = parsed.body;
    return typeof text === 'string' && text.trim() !== '' ? { label: 'PR body', text } : undefined;
  } catch (error) {
    console.error(`private-data: gh pr view failed (${error instanceof Error ? error.message : String(error)}); PR body not checked`);
    return undefined;
  }
}

interface Options {
  base: string;
  bodyFile?: string;
}

function parseOptions(argv: string[]): Options {
  const options: Options = { base: DEFAULT_BASE };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--base') options.base = argv[++index] ?? options.base;
    else if (arg === '--body-file') options.bodyFile = argv[++index];
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

async function main(): Promise<void> {
  try {
    const options = parseOptions(process.argv.slice(2));
    const commits = await commitSources(options.base);
    const pr = options.bodyFile
      ? { label: 'PR body', text: readFileSync(options.bodyFile, 'utf8') }
      : await pullRequestSource();
    const key = requirePrivateTermsKey();
    if (key === undefined && KEYED_TERM_HASHES.size > 0) {
      console.error(
        'private-data: warning: MDCLI_PRIVATE_TERMS_KEY is unset; low-entropy numeric terms were not checked'
      );
    }
    const hits = messageHits(pr ? [...commits, pr] : commits);
    if (hits.length > 0) {
      console.error(`✗ private-data: ${hits.length} message source(s) carry a guarded term (issue #216).`);
      for (const hit of hits) console.error(`  ${hit.label}: line ${hit.lines.join(', ')}`);
      console.error('A pushed commit message only changes with a force-push; fix it before pushing.');
      process.exitCode = 1;
      return;
    }
    console.log(`✓ private-data: ${commits.length} commit(s) in ${options.base}..HEAD, ${pr ? 'PR body checked' : 'no PR body'}`);
  } catch (error) {
    console.error(`private-data: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) await main();
