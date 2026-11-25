import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { git, gitResult } from './git.js';

/**
 * The write surface the risk gate reads, derived from the code instead of a
 * hand-kept list. A list of write functions missed closeCardInvoice and
 * reopenCardInvoice (#348), the same way a list of write paths missed
 * budget-write.ts (#315).
 */
export interface WriteSurface {
  /** Functions of the API client (`src/lib/api.ts`, `src/lib/api/**`) that send a POST, PUT or DELETE. */
  functions: ReadonlySet<string>;
  /** src modules that call the write API or one of those functions. */
  modules: ReadonlySet<string>;
}

export const WRITE_API_CALL = /\bapi(?:Post|Put|Delete)\s*[<(]/;
const WRITE_LITERAL = /['"`](?:POST|PUT|DELETE)['"`]/;
const API_CLIENT = /^src\/lib\/api(?:\.ts$|\/.+\.ts$)/;
// A top-level function or variable declaration starts a chunk; any other line
// at column 0 (type, interface, import, export list) ends it.
const DECLARATION = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\s*\*?\s*|(?:const|let|var)\s+)([A-Za-z_$][\w$]*)/;
const TOP_LEVEL = /^[A-Za-z_$@]/;

interface Chunk {
  name: string;
  text: string;
}

function chunksOf(source: string): Chunk[] {
  const chunks: Chunk[] = [];
  let current: { name: string; lines: string[] } | undefined;
  for (const line of source.split('\n')) {
    if (TOP_LEVEL.test(line)) {
      if (current) chunks.push({ name: current.name, text: current.lines.join('\n') });
      const name = DECLARATION.exec(line)?.[1];
      current = name === undefined ? undefined : { name, lines: [line] };
    } else {
      current?.lines.push(line);
    }
  }
  if (current) chunks.push({ name: current.name, text: current.lines.join('\n') });
  return chunks;
}

function escapeName(name: string): string {
  return name.replaceAll('$', '\\$');
}

/** A regex that matches a call to any of `names`, or null when there is none. */
export function callPattern(names: ReadonlySet<string>): RegExp | null {
  if (names.size === 0) return null;
  return new RegExp(`(?<![\\w$])(?:${[...names].map(escapeName).join('|')})\\s*[<(]`);
}

/**
 * The declarations of the API client sources that write: a chunk that names
 * POST, PUT or DELETE, calls the write API, or calls another writer (so a
 * wrapper around a writer is a writer too).
 */
function writeFunctionsIn(sources: Iterable<string>): Set<string> {
  const chunks = [...sources].flatMap(chunksOf);
  const writers = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    const calls = callPattern(writers);
    for (const chunk of chunks) {
      if (writers.has(chunk.name)) continue;
      const body = chunk.text.slice(chunk.text.indexOf(chunk.name) + chunk.name.length);
      if (WRITE_LITERAL.test(body) || WRITE_API_CALL.test(body) || calls?.test(body) === true) {
        writers.add(chunk.name);
        grew = true;
      }
    }
  }
  return writers;
}

function srcFiles(root: string): string[] {
  const src = join(root, 'src');
  if (!existsSync(src)) return [];
  return readdirSync(src, { recursive: true, encoding: 'utf8' })
    .map((entry) => `src/${entry.replaceAll('\\', '/')}`)
    .filter((path) => path.endsWith('.ts'));
}

function isWriter(text: string, calls: RegExp | null): boolean {
  return WRITE_API_CALL.test(text) || calls?.test(text) === true;
}

/** The write surface of the files on disk under `root`. */
export function writeSurface(root: string): WriteSurface {
  const texts = new Map(srcFiles(root).map((path) => [path, readFileSync(join(root, path), 'utf8')]));
  const functions = writeFunctionsIn([...texts].filter(([path]) => API_CLIENT.test(path)).map(([, text]) => text));
  const calls = callPattern(functions);
  const modules = new Set([...texts].filter(([, text]) => isWriter(text, calls)).map(([path]) => path));
  return { functions, modules };
}

async function showAt(ref: string, path: string, root: string): Promise<string> {
  return git(['show', `${ref}:${path}`], root);
}

/**
 * The write surface of the tree at `ref`. A PR that renames a writer or moves
 * its call out of a file would drop it from the head surface while the base
 * still wrote through it, so the classifier takes both sides (#315).
 */
export async function writeSurfaceAt(ref: string, root: string): Promise<WriteSurface> {
  const files = (await git(['ls-tree', '-r', '--name-only', ref, '--', 'src'], root))
    .split('\n')
    .filter((path) => path.endsWith('.ts'));
  const sources = await Promise.all(files.filter((path) => API_CLIENT.test(path)).map((path) => showAt(ref, path, root)));
  const functions = writeFunctionsIn(sources);
  const names = ['api(Post|Put|Delete)', ...[...functions].map((name) => name.replaceAll('$', '[$]'))];
  const pattern = `(^|[^[:alnum:]_$])(${names.join('|')})[[:space:]]*[<(]`;
  const result = await gitResult(['grep', '-l', '-E', pattern, ref, '--', 'src'], root);
  if (result.exitCode > 1) {
    throw new Error(`cannot read the write surface of ${ref}: ${result.stderr.toString().trim()}`);
  }
  const modules = new Set<string>();
  for (const line of result.stdout.toString().split('\n')) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const path = line.slice(separator + 1);
    if (path.endsWith('.ts')) modules.add(path);
  }
  return { functions, modules };
}

export function mergeSurfaces(...surfaces: readonly WriteSurface[]): WriteSurface {
  return {
    functions: new Set(surfaces.flatMap((surface) => [...surface.functions])),
    modules: new Set(surfaces.flatMap((surface) => [...surface.modules])),
  };
}
