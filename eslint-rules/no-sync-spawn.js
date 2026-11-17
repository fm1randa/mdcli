// An ESM named import of spawnSync, execSync, or execFileSync keeps the
// original binding. test/sync-spawn-guard.ts patches Bun.spawnSync and the
// default export, and that patch never reaches the named binding
// (oven-sh/bun#34069, #301). src/lib/sync-child.ts is the only production
// caller. The guard and its probe are the other two files that may name them.
const SYNC = new Set(["spawnSync", "execSync", "execFileSync"]);
const CHILD_PROCESS = new Set(["child_process", "node:child_process"]);

/** A static name: `a.name`, `a["name"]`, `` a[`name`] ``, `{ name }`. A computed variable has none. */
const keyName = (key, computed) => {
  if (!key) return undefined;
  if (key.type === "Literal") return String(key.value);
  if (key.type === "TemplateLiteral" && key.expressions.length === 0) return key.quasis[0].value.cooked;
  return key.type === "Identifier" && !computed ? key.name : undefined;
};

const importedName = (node) => (node.type === "Identifier" ? node.name : node.value);

export default {
  meta: {
    type: "problem",
    docs: { description: "Synchronous child processes go through src/lib/sync-child.ts" },
    messages: {
      namedImport:
        "Call {{name}} only from src/lib/sync-child.ts. A named ESM import keeps the original binding, so test/sync-spawn-guard.ts cannot stop it (oven-sh/bun#34069).",
      namespaceImport:
        "Do not namespace-import child_process. The namespace keeps spawnSync, execSync, and execFileSync on the original binding, which test/sync-spawn-guard.ts cannot patch (oven-sh/bun#34069). Use src/lib/sync-child.ts for a synchronous wait, or import { spawn } for an async one.",
      member:
        "Call {{name}} only from src/lib/sync-child.ts. A synchronous spawn hangs a bun test --parallel worker (oven-sh/bun#34069). Use runInheritedShell or readCommandStdout, or Bun.spawn.",
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
        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportNamespaceSpecifier" && isChild(node.source)) {
            context.report({ node: specifier, messageId: "namespaceImport" });
          } else if (specifier.type === "ImportSpecifier") {
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
