// Every gate in scripts/ grew its own Bun.spawnSync wrapper around git, gh or
// bun, each with its own error text and `origin/main` default, and the fix for
// the oven-sh/bun#34069 hang reached only one of them (#260). scripts/git.ts
// owns child processes; the rest of scripts/ goes through it.
const SPAWNERS = new Set(["spawn", "spawnSync"]);
const CHILD_PROCESS = new Set(["child_process", "node:child_process"]);

export default {
  meta: {
    type: "problem",
    docs: { description: "Spawn child processes in scripts/ only through scripts/git.ts" },
    messages: {
      rawSpawn:
        "Spawn through scripts/git.ts (git, gitBytes, gitResult, gitQuiet, spawn, spawnAsync) instead of Bun.{{name}}; it owns the error text, the path quoting and the oven-sh/bun#34069 workaround.",
      bunShell: "Spawn through scripts/git.ts instead of the Bun shell ($); it owns child processes in scripts/.",
      childProcess: "Spawn through scripts/git.ts instead of {{source}}; it owns child processes in scripts/.",
    },
    schema: [],
  },
  create(context) {
    const checkSource = (node) => {
      if (node.source?.type === "Literal" && CHILD_PROCESS.has(node.source.value)) {
        context.report({ node, messageId: "childProcess", data: { source: node.source.value } });
      }
    };
    return {
      MemberExpression(node) {
        const name = node.property.type === "Identifier" && !node.computed ? node.property.name : node.property.value;
        if (node.object.type === "Identifier" && node.object.name === "Bun" && SPAWNERS.has(name)) {
          context.report({ node, messageId: "rawSpawn", data: { name } });
        }
      },
      ImportDeclaration(node) {
        checkSource(node);
        if (node.source.value === "bun" && node.specifiers.some((s) => s.type === "ImportSpecifier" && s.imported.name === "$")) {
          context.report({ node, messageId: "bunShell" });
        }
      },
      ExportAllDeclaration: checkSource,
      ExportNamedDeclaration: checkSource,
      ImportExpression(node) {
        if (node.source.type === "Literal" && CHILD_PROCESS.has(node.source.value)) {
          context.report({ node, messageId: "childProcess", data: { source: node.source.value } });
        }
      },
      CallExpression(node) {
        const [arg] = node.arguments;
        if (node.callee.type === "Identifier" && node.callee.name === "require" && arg?.type === "Literal" && CHILD_PROCESS.has(arg.value)) {
          context.report({ node, messageId: "childProcess", data: { source: arg.value } });
        }
      },
    };
  },
};
