// Synchronous spawn belongs in src/lib/sync-child.ts. On Bun 1.4.2 a named
// `import { spawnSync } from "bun"` captured before test/sync-spawn-guard.ts
// assigns Bun.spawnSync keeps the original function and starts the child.
// A named import from node:child_process calls that assignment, so the child
// does not start. The owner may import the three names only from
// node:child_process or child_process.
const SYNC = new Set(["spawnSync", "execSync", "execFileSync"]);
const CHILD_PROCESS = new Set(["child_process", "node:child_process"]);
const OWNER = /[\\/]src[\\/]lib[\\/]sync-child\.ts$/;

/** A static name: `a.name`, `a["name"]`, `` a[`name`] ``, `{ name }`. A computed variable has none. */
const keyName = (key, computed) => {
  if (!key) return undefined;
  if (key.type === "Literal") return String(key.value);
  if (key.type === "TemplateLiteral" && key.expressions.length === 0) return key.quasis[0].value.cooked;
  return key.type === "Identifier" && !computed ? key.name : undefined;
};

const importedName = (node) => (node.type === "Identifier" ? node.name : node.value);

const ownerChildSource = (filename, source) =>
  OWNER.test(filename) && source?.type === "Literal" && CHILD_PROCESS.has(source.value);

export default {
  meta: {
    type: "problem",
    docs: { description: "Synchronous child processes go through src/lib/sync-child.ts" },
    messages: {
      namedImport:
        'Import {{name}} only in src/lib/sync-child.ts, and only from node:child_process. A named import from "bun" captured before the guard keeps the original function and starts the child (Bun 1.4.2).',
      namespaceImport:
        "Do not namespace-import child_process. Import spawnSync, execSync, or execFileSync only in src/lib/sync-child.ts, from node:child_process.",
      member:
        "Call {{name}} only from src/lib/sync-child.ts. Use runInheritedShell or readCommandStdout, or async Bun.spawn.",
    },
    schema: [],
  },
  create(context) {
    const isChild = (node) => node?.type === "Literal" && CHILD_PROCESS.has(node.value);
    const isBun = (node) => node?.type === "Literal" && node.value === "bun";
    const reportSync = (node, name, messageId) => {
      if (SYNC.has(name)) context.report({ node, messageId, data: { name } });
    };

    return {
      ImportDeclaration(node) {
        if (!isChild(node.source) && !isBun(node.source)) return;
        const ownerChild = ownerChildSource(context.filename, node.source);
        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportNamespaceSpecifier" && isChild(node.source)) {
            context.report({ node: specifier, messageId: "namespaceImport" });
          } else if (specifier.type === "ImportSpecifier" && !ownerChild) {
            reportSync(specifier, importedName(specifier.imported), "namedImport");
          }
        }
      },
      ExportAllDeclaration(node) {
        if (isChild(node.source)) context.report({ node, messageId: "namespaceImport" });
      },
      ExportNamedDeclaration(node) {
        if (!node.source || (!isChild(node.source) && !isBun(node.source))) return;
        for (const specifier of node.specifiers) {
          reportSync(specifier, importedName(specifier.local), "namedImport");
        }
      },
      MemberExpression(node) {
        reportSync(node, keyName(node.property, node.computed), "member");
      },
      Property(node) {
        if (node.parent.type !== "ObjectPattern") return;
        reportSync(node, keyName(node.key, node.computed), "member");
      },
    };
  },
};
