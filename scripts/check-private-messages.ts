import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scanText } from './private-terms.js';

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
  allowed?: ReadonlySet<string>
): MessageHit[] {
  const hits: MessageHit[] = [];
  for (const source of sources) {
    const lines = scanText(source.text, terms, allowed);
    if (lines.length > 0) hits.push({ label: source.label, lines });
  }
  return hits;
}

export function commitSources(base: string, root: string = join(import.meta.dirname, '..')): MessageSource[] {
  const result = Bun.spawnSync(['git', 'log', `${base}..HEAD`, '--format=%H%x00%B%x00'], {
    stdout: 'pipe',
    stderr: 'pipe',
    cwd: root,
  });
  if (result.exitCode !== 0) throw new Error(`git log ${base}..HEAD failed: ${result.stderr.toString().trim()}`);
  const parts = result.stdout.toString().split('\0');
  const sources: MessageSource[] = [];
  // git joins records with a newline, so the next record's SHA carries it.
  for (let index = 0; index + 1 < parts.length; index += 2) {
    const sha = parts[index]!.trim();
    if (sha === '') continue;
    sources.push({ label: `commit ${sha.slice(0, 7)}`, text: parts[index + 1]! });
  }
  return sources;
}

export function pullRequestSource(): MessageSource | undefined {
  const body = process.env.PR_BODY;
  if (body !== undefined) return body.trim() === '' ? undefined : { label: 'PR body', text: body };
  try {
    const result = Bun.spawnSync(['gh', 'pr', 'view', '--json', 'body'], {
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 5000,
    });
    if (result.exitCode !== 0) return undefined;
    const parsed = JSON.parse(result.stdout.toString()) as { body?: unknown };
    const text = parsed.body;
    return typeof text === 'string' && text.trim() !== '' ? { label: 'PR body', text } : undefined;
  } catch {
    return undefined;
  }
}

interface Options {
  base: string;
  bodyFile?: string;
}

function parseOptions(argv: string[]): Options {
  const options: Options = { base: 'origin/main' };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--base') options.base = argv[++index] ?? options.base;
    else if (arg === '--body-file') options.bodyFile = argv[++index];
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function main(): void {
  try {
    const options = parseOptions(process.argv.slice(2));
    const commits = commitSources(options.base);
    const pr = options.bodyFile
      ? { label: 'PR body', text: readFileSync(options.bodyFile, 'utf8') }
      : pullRequestSource();
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

if (import.meta.main) main();
