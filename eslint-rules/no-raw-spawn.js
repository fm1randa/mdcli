// Every gate in scripts/ grew its own Bun.spawnSync wrapper around git, gh or
// bun, each with its own error text and `origin/main` default, and the fix for
// the oven-sh/bun#34069 hang reached only one of them (#260). scripts/git.ts
// owns child processes; the rest of scripts/ goes through it.
//
// Bun reaches a spawner through the global (`Bun`, `globalThis.Bun`), the
// "bun" module (named, default or namespace import) and destructuring of
// either, so each of those paths is checked (#272).
const SPAWNERS = new Set(["spawn", "spawnSync", "$"]);
const CHILD_PROCESS = new Set(["child_process", "node:child_process"]);

/** The static name of a member or key: `a.name`, `a["name"]`, `{ name }`; a computed variable has none. */
const keyName = (key, computed) => {
  if (key.type === "Literal") return key.value;
  return key.type === "Identifier" && !computed ? key.name : undefined;
};

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
    // Local names bound to the "bun" module object (default or namespace import).
    const bunModules = new Set();

    const isBun = (node) => {
      if (node.type === "Identifier") return node.name === "Bun" || bunModules.has(node.name);
      return node.type === "MemberExpression" && node.object.type === "Identifier"
        && node.object.name === "globalThis" && keyName(node.property, node.computed) === "Bun";
    };
    const report = (node, name) => {
      if (name === "$") context.report({ node, messageId: "bunShell" });
      else context.report({ node, messageId: "rawSpawn", data: { name } });
    };
    const checkSource = (node) => {
      if (node.source?.type === "Literal" && CHILD_PROCESS.has(node.source.value)) {
        context.report({ node, messageId: "childProcess", data: { source: node.source.value } });
      }
    };
    return {
      Program(program) {
        for (const statement of program.body) {
          if (statement.type !== "ImportDeclaration" || statement.source.value !== "bun") continue;
          for (const specifier of statement.specifiers) {
            if (specifier.type !== "ImportSpecifier") bunModules.add(specifier.local.name);
          }
        }
      },
      MemberExpression(node) {
        const name = keyName(node.property, node.computed);
        if (SPAWNERS.has(name) && isBun(node.object)) report(node, name);
      },
      VariableDeclarator(node) {
        if (node.id.type !== "ObjectPattern" || !node.init || !isBun(node.init)) return;
        for (const property of node.id.properties) {
          const name = property.type === "Property" ? keyName(property.key, property.computed) : undefined;
          if (SPAWNERS.has(name)) report(property, name);
        }
      },
      ImportDeclaration(node) {
        checkSource(node);
        if (node.source.value !== "bun") return;
        for (const specifier of node.specifiers) {
          const name = specifier.type === "ImportSpecifier" ? keyName(specifier.imported, false) : undefined;
          if (SPAWNERS.has(name)) report(specifier, name);
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
