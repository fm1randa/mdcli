import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { parseInteger } from '../src/utils/parse.js';
import { git, gitBytes } from './git.js';

/**
 * The write surface the risk gate reads, derived from the code instead of a
 * hand-kept list. A list of write functions missed closeCardInvoice and
 * reopenCardInvoice (#348), the same way a list of write paths missed
 * budget-write.ts (#315). The TypeScript checker resolves every name, so an
 * import alias, a re-export, an object or class method and a method held in a
 * constant reach the writer they name (#357).
 */
export interface WriteSurface {
  /** Declarations of the API client (`src/lib/api.ts`, `src/lib/api/**`) that send a POST, PUT or DELETE; a member reads `owner.member`. */
  functions: ReadonlySet<string>;
  /** src modules that declare or reference the write API or one of those declarations. */
  modules: ReadonlySet<string>;
}

export const WRITE_API_CALL = /\bapi(?:Post|Put|Delete)\s*[<(]/;
const WRITE_API_NAME = /^api(?:Post|Put|Delete)$/;
const WRITE_METHOD = /^(?:POST|PUT|DELETE)$/;
const API_CLIENT = /^src\/lib\/api(?:\.ts$|\/.+\.ts$)/;
const VIRTUAL_ROOT = '/repo/';

/** A regex that matches a call to any of `names`, or null when there is none. */
export function callPattern(names: ReadonlySet<string>): RegExp | null {
  if (names.size === 0) return null;
  const alternatives = [...names].map((name) => name.replaceAll(/[.$]/g, '\\$&'));
  return new RegExp(`(?<![\\w$])(?:${alternatives.join('|')})\\s*[<(]`);
}

/** A declaration that can hold a write: the unit the fixpoint marks. */
type Unit =
  | ts.FunctionDeclaration
  | ts.VariableDeclaration
  | ts.MethodDeclaration
  | ts.PropertyAssignment
  | ts.ShorthandPropertyAssignment
  | ts.PropertyDeclaration
  | ts.ClassDeclaration
  | ts.AccessorDeclaration;

/**
 * Only a declaration outside any function body: a local or a member built
 * inside a function cannot be named from outside it, and its literals and
 * references already belong to the function around it.
 */
function isUnit(node: ts.Node): node is Unit {
  for (let parent: ts.Node | undefined = node.parent; parent !== undefined; parent = parent.parent) {
    if (ts.isFunctionLike(parent)) return false;
  }
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isVariableDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isPropertyAssignment(node) ||
    ts.isShorthandPropertyAssignment(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isAccessor(node)
  );
}

interface UnitFacts {
  path: string;
  name: string | undefined;
  /** Names POST, PUT or DELETE in a value (a type such as `'GET' | 'POST'` does not count). */
  literal: boolean;
  references: Set<ts.Node>;
}

interface FileFacts {
  references: Set<ts.Node>;
  /** Calls `apiPost`, `apiPut` or `apiDelete` without a declaration in the tree. */
  unresolvedWriteApi: boolean;
}

function unitName(unit: Unit, owner: string | undefined): string | undefined {
  const name = unit.name !== undefined && (ts.isIdentifier(unit.name) || ts.isPrivateIdentifier(unit.name)) ? unit.name.text : undefined;
  if (name === undefined) return undefined;
  return owner === undefined ? name : `${owner}.${name}`;
}

/** The identifier is the name a declaration introduces, not a reference. */
function isDeclarationName(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (ts.isPropertyAccessExpression(parent) || ts.isShorthandPropertyAssignment(parent)) return false;
  return 'name' in parent && parent.name === node;
}

class Collector {
  readonly units = new Map<Unit, UnitFacts>();
  readonly files = new Map<string, FileFacts>();

  constructor(
    private readonly checker: ts.TypeChecker,
    /** The only texts that can name a writer; resolving every identifier costs seconds per tree. */
    private readonly candidates: ReadonlySet<string>,
  ) {}

  /** The declarations a reference names, through every import and re-export alias. */
  private declarationsOf(node: ts.Identifier): readonly ts.Node[] {
    const parent = node.parent;
    let symbol = ts.isShorthandPropertyAssignment(parent)
      ? this.checker.getShorthandAssignmentValueSymbol(parent)
      : this.checker.getSymbolAtLocation(node);
    if (symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0) symbol = this.checker.getAliasedSymbol(symbol);
    return symbol?.declarations ?? [];
  }

  collect(path: string, source: ts.SourceFile): void {
    const file: FileFacts = { references: new Set(), unresolvedWriteApi: false };
    this.files.set(path, file);
    const inClient = API_CLIENT.test(path);
    const open: UnitFacts[] = [];
    const local = localNames(source, this.candidates);
    const reference = (node: ts.Identifier): boolean => {
      if (!this.candidates.has(node.text) && !local.has(node.text)) return false;
      const declarations = this.declarationsOf(node);
      if (declarations.length === 0 && WRITE_API_NAME.test(node.text)) file.unresolvedWriteApi = true;
      for (const declaration of declarations) {
        file.references.add(declaration);
        for (const unit of open) unit.references.add(declaration);
      }
      return declarations.length > 0;
    };
    // `a.b.member`: when the member resolves, it alone is the reference, so a
    // reader on an object that also holds a writer stays a reader.
    const visitOwner = (node: ts.Expression): void => {
      if (ts.isIdentifier(node)) return;
      if (ts.isPropertyAccessExpression(node)) {
        visitOwner(node.expression);
        return;
      }
      visit(node);
    };
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
      // `extends Base` is an ExpressionWithTypeArguments: a value reference, not a type.
      if ((ts.isTypeNode(node) && !ts.isExpressionWithTypeArguments(node)) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
      if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && WRITE_METHOD.test(node.text)) {
        for (const unit of open) unit.literal = true;
        return;
      }
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name)) {
        if (reference(node.name)) visitOwner(node.expression);
        else visit(node.expression);
        return;
      }
      if (ts.isIdentifier(node)) {
        if (!isDeclarationName(node)) reference(node);
        return;
      }
      if (inClient && isUnit(node)) {
        const facts: UnitFacts = { path, name: unitName(node, open.at(-1)?.name), literal: false, references: new Set() };
        this.units.set(node, facts);
        open.push(facts);
        ts.forEachChild(node, visit);
        open.pop();
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
}

/**
 * A writer is reached by its declared name or a re-export name, and inside a
 * file by an import binding of one of those (see localNames); any other
 * identifier text cannot resolve to a writer, so the checker skips it.
 */
function candidateNames(sources: Iterable<readonly [string, ts.SourceFile]>): Set<string> {
  const names = new Set(['apiPost', 'apiPut', 'apiDelete']);
  for (const [path, source] of sources) {
    if (API_CLIENT.test(path)) {
      const visit = (node: ts.Node): void => {
        if (isUnit(node) && node.name !== undefined && ts.isIdentifier(node.name)) names.add(node.name.text);
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    for (const statement of source.statements) {
      if (!ts.isExportDeclaration(statement) || statement.exportClause === undefined) continue;
      if (ts.isNamespaceExport(statement.exportClause)) names.add(statement.exportClause.name.text);
      else for (const specifier of statement.exportClause.elements) names.add(specifier.name.text);
    }
  }
  return names;
}

/** The import bindings of `source` that rename a candidate or take a default export. */
function localNames(source: ts.SourceFile, candidates: ReadonlySet<string>): Set<string> {
  const names = new Set<string>();
  for (const statement of source.statements) {
    const clause = ts.isImportDeclaration(statement) ? statement.importClause : undefined;
    if (clause === undefined) continue;
    if (clause.name !== undefined) names.add(clause.name.text);
    const bindings = clause.namedBindings;
    if (bindings === undefined || ts.isNamespaceImport(bindings)) continue;
    for (const specifier of bindings.elements) {
      if (candidates.has((specifier.propertyName ?? specifier.name).text)) names.add(specifier.name.text);
    }
  }
  return names;
}

// Head and base share most files: one parse per text serves both programs.
const parsed = new Map<string, ts.SourceFile>();

function sourceFileOf(name: string, text: string): ts.SourceFile {
  const cached = parsed.get(name);
  if (cached?.text === text) return cached;
  const source = ts.createSourceFile(name, text, ts.ScriptTarget.ESNext, true);
  parsed.set(name, source);
  return source;
}

const DEFAULT_IMPORT = /\bimport\s+[A-Za-z_$][\w$]*\s*(?:,|from\b)/;

const IDENTIFIER = /[A-Za-z_$][\w$]*/g;

/**
 * The API client plus every file whose text names a candidate or takes a
 * default import, grown until no file joins: a file outside it cannot hold a
 * reference to a writer, so the program never parses it. The checker still
 * decides what each name resolves to.
 */
function relevantFiles(files: ReadonlyMap<string, string>): { relevant: Map<string, string>; candidates: Set<string> } {
  const relevant = new Map([...files].filter(([path]) => API_CLIENT.test(path)));
  const tokens = new Map([...files].map(([path, text]) => [path, new Set(text.match(IDENTIFIER))]));
  for (;;) {
    const candidates = candidateNames([...relevant].map(([path, text]) => [path, sourceFileOf(VIRTUAL_ROOT + path, text)]));
    const names = (path: string): boolean => [...candidates].some((name) => tokens.get(path)?.has(name) === true);
    const joined = [...files].filter(([path, text]) => !relevant.has(path) && (names(path) || DEFAULT_IMPORT.test(text)));
    if (joined.length === 0) return { relevant, candidates };
    for (const [path, text] of joined) relevant.set(path, text);
  }
}

function programOf(files: ReadonlyMap<string, string>): ts.Program {
  const relative = (name: string): string | undefined =>
    name.startsWith(VIRTUAL_ROOT) ? name.slice(VIRTUAL_ROOT.length) : undefined;
  const textOf = (name: string): string | undefined => {
    const path = relative(name);
    return path === undefined ? undefined : files.get(path);
  };
  const host: ts.CompilerHost = {
    getSourceFile: (name) => {
      const text = textOf(name);
      return text === undefined ? undefined : sourceFileOf(name, text);
    },
    fileExists: (name) => textOf(name) !== undefined,
    readFile: textOf,
    getDefaultLibFileName: () => `${VIRTUAL_ROOT}lib.d.ts`,
    writeFile: () => undefined,
    getCurrentDirectory: () => VIRTUAL_ROOT,
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
  };
  const options: ts.CompilerOptions = {
    noLib: true,
    types: [],
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  };
  return ts.createProgram([...files.keys()].map((path) => VIRTUAL_ROOT + path), options, host);
}

/**
 * The one derivation both sides use: an API client declaration that names
 * POST, PUT or DELETE, or references another writer, is a writer (so a
 * wrapper, a method and its object or class are too); a src module that
 * declares or references a writer is a write module.
 */
function surfaceOf(files: ReadonlyMap<string, string>): WriteSurface {
  const { relevant, candidates } = relevantFiles(files);
  const program = programOf(relevant);
  const collector = new Collector(program.getTypeChecker(), candidates);
  for (const path of relevant.keys()) {
    const source = program.getSourceFile(VIRTUAL_ROOT + path);
    if (source !== undefined) collector.collect(path, source);
  }
  const writers = new Set<ts.Node>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const [unit, facts] of collector.units) {
      if (writers.has(unit)) continue;
      if (facts.literal || [...facts.references].some((declaration) => writers.has(declaration))) {
        writers.add(unit);
        grew = true;
      }
    }
  }
  const functions = new Set<string>();
  const modules = new Set<string>();
  for (const [unit, facts] of collector.units) {
    if (!writers.has(unit)) continue;
    if (facts.name !== undefined) functions.add(facts.name);
    modules.add(facts.path);
  }
  for (const [path, facts] of collector.files) {
    if (facts.unresolvedWriteApi || [...facts.references].some((declaration) => writers.has(declaration))) modules.add(path);
  }
  return { functions, modules };
}

function srcFiles(root: string): string[] {
  const src = join(root, 'src');
  if (!existsSync(src)) return [];
  return readdirSync(src, { recursive: true, encoding: 'utf8' })
    .map((entry) => `src/${entry.replaceAll('\\', '/')}`)
    .filter((path) => path.endsWith('.ts'));
}

/** The write surface of the files on disk under `root`. */
export function writeSurface(root: string): WriteSurface {
  return surfaceOf(new Map(srcFiles(root).map((path) => [path, readFileSync(join(root, path), 'utf8')])));
}

/** Every blob of `paths` at `ref`, read in one `git cat-file --batch`. */
async function readAt(ref: string, paths: readonly string[], root: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  if (paths.length === 0) return files;
  const input = new TextEncoder().encode(paths.map((path) => `${ref}:${path}\n`).join(''));
  const output = await gitBytes(['cat-file', '--batch'], root, input);
  let offset = 0;
  for (const path of paths) {
    const end = output.indexOf(10, offset);
    if (end === -1) throw new Error(`cannot read ${path} at ${ref}: git cat-file stopped early`);
    const header = output.subarray(offset, end).toString().split(' ');
    const size = parseInteger(header[2] ?? '');
    if (header[1] !== 'blob' || size === undefined) {
      throw new Error(`cannot read ${path} at ${ref}: ${header.join(' ')}`);
    }
    files.set(path, output.subarray(end + 1, end + 1 + size).toString());
    offset = end + 1 + size + 1;
  }
  return files;
}

/**
 * The write surface of the tree at `ref`. A PR that renames a writer or moves
 * its call out of a file would drop it from the head surface while the base
 * still wrote through it, so the classifier takes both sides (#315).
 */
export async function writeSurfaceAt(ref: string, root: string): Promise<WriteSurface> {
  const paths = (await git(['ls-tree', '-r', '-z', '--name-only', ref, '--', 'src'], root))
    .split('\0')
    .filter((path) => path.endsWith('.ts'));
  return surfaceOf(await readAt(ref, paths, root));
}

export function mergeSurfaces(...surfaces: readonly WriteSurface[]): WriteSurface {
  return {
    functions: new Set(surfaces.flatMap((surface) => [...surface.functions])),
    modules: new Set(surfaces.flatMap((surface) => [...surface.modules])),
  };
}
