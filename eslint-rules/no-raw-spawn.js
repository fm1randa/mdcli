// Every gate in scripts/ grew its own Bun.spawnSync wrapper around git, gh or
// bun, each with its own error text and `origin/main` default, and the fix for
// the oven-sh/bun#34069 hang reached only one of them (#260). scripts/git.ts
// owns child processes; the rest of scripts/ goes through it.
//
// A list of spellings always misses the next one (#272), so the rule follows
// the Bun object from the sources its tests prove (the `Bun` global,
// `globalThis.Bun`, `global.Bun`, `self.Bun`, imports of "bun", `await
// import("bun")`, `require("bun")` with a string literal), through casts,
// `const` aliases and destructuring; it may only be read by a static
// non-spawner key. A computed key, a rest element or a hand-off fails, because
// the rule can no longer see which key is read. AGENTS.md (Rule coverage) lists
// the forms it does not see, which stay with review.
const SPAWNERS = new Set(["spawn", "spawnSync", "$"]);
const CHILD_PROCESS = new Set(["child_process", "node:child_process"]);
const GLOBAL_OBJECTS = ["globalThis", "global", "self", "window"];
const TRANSPARENT = new Set(["TSAsExpression", "TSNonNullExpression", "TSTypeAssertion", "TSSatisfiesExpression", "ChainExpression"]);

/** The static name of a member or key: `a.name`, `a["name"]`, `` a[`name`] ``, `{ name }`; a computed variable has none. */
const keyName = (key, computed) => {
  if (key.type === "Literal") return String(key.value);
  if (key.type === "TemplateLiteral" && key.expressions.length === 0) return key.quasis[0].value.cooked;
  return key.type === "Identifier" && !computed ? key.name : undefined;
};

export default {
  meta: {
    type: "problem",
    docs: { description: "Spawn child processes in scripts/ only through scripts/git.ts" },
    messages: {
      rawSpawn:
        "Spawn through scripts/git.ts (git, gitBytes, gitResult, gitQuiet, spawn) instead of Bun.{{name}}; it owns the error text, the path quoting and the oven-sh/bun#34069 workaround.",
      bunShell: "Spawn through scripts/git.ts instead of the Bun shell ($); it owns child processes in scripts/.",
      childProcess: "Spawn through scripts/git.ts instead of {{source}}; it owns child processes in scripts/.",
      opaqueBun:
        "Read Bun APIs only as Bun.<name> (or a destructured static name); the rule cannot tell whether this {{what}} reaches Bun.spawn, so spawn through scripts/git.ts.",
    },
    schema: [],
  },
  create(context) {
    const { sourceCode } = context;
    const seen = new Set();

    const report = (node, name) => {
      if (name === "$") context.report({ node, messageId: "bunShell" });
      else context.report({ node, messageId: "rawSpawn", data: { name } });
    };
    const opaque = (node, what) => context.report({ node, messageId: "opaqueBun", data: { what } });
    const isChildProcess = (node) => node?.type === "Literal" && CHILD_PROCESS.has(node.value);
    const isBunSource = (node) => node?.type === "Literal" && node.value === "bun";

    /** Checks every read of a variable bound to `kind`, so an alias is followed instead of trusted. */
    const followVariable = (variable, kind) => {
      for (const reference of variable?.references ?? []) {
        if (reference.isRead()) track(reference.identifier, kind);
      }
    };
    const variableOf = (pattern, identifier) =>
      sourceCode.getDeclaredVariables(pattern).find((v) => v.name === identifier.name);

    /** A destructuring pattern whose source is `kind` ("bun" or "global"). */
    const checkPattern = (pattern, kind, declarator) => {
      for (const property of pattern.properties) {
        if (property.type === "RestElement") {
          opaque(property, "rest element");
          continue;
        }
        const name = keyName(property.key, property.computed);
        if (name === undefined) {
          opaque(property, "computed key");
          continue;
        }
        if (kind === "bun") {
          if (SPAWNERS.has(name)) report(property, name);
          continue;
        }
        if (name !== "Bun") continue;
        // A destructured Bun from a global object: `{ Bun: { spawnSync } }` or `{ Bun: b }`.
        let value = property.value;
        if (value.type === "AssignmentPattern") value = value.left;
        if (value.type === "ObjectPattern") checkPattern(value, "bun", declarator);
        else if (value.type === "Identifier" && declarator) followVariable(variableOf(declarator, value), "bun");
        else opaque(property, "Bun binding");
      }
    };

    /** `node` evaluates to the Bun object (`kind` "bun") or a global object that holds it ("global"). */
    function track(start, kind) {
      if (seen.has(start)) return;
      seen.add(start);
      let node = start;
      while (TRANSPARENT.has(node.parent.type)) node = node.parent;
      const { parent } = node;

      if (parent.type === "MemberExpression" && parent.object === node) {
        const name = keyName(parent.property, parent.computed);
        if (name === undefined) {
          opaque(parent, kind === "bun" ? "computed key" : "computed key on the global object");
          return;
        }
        if (kind === "bun" && SPAWNERS.has(name)) report(parent, name);
        if (kind === "global" && name === "Bun") track(parent, "bun");
        return;
      }
      if (parent.type === "VariableDeclarator" && parent.init === node) {
        if (parent.id.type === "ObjectPattern") checkPattern(parent.id, kind, parent);
        else if (parent.id.type === "Identifier") followVariable(variableOf(parent, parent.id), kind);
        else opaque(parent, "binding");
        return;
      }
      if (parent.type === "AssignmentExpression" && parent.right === node && parent.left.type === "ObjectPattern") {
        checkPattern(parent.left, kind, undefined);
        return;
      }
      // `typeof Bun` as a value or a type reads no key.
      if (parent.type === "UnaryExpression" && parent.operator === "typeof") return;
      if (parent.type === "TSTypeQuery" || parent.type === "TSQualifiedName") return;
      if (parent.type === "BinaryExpression" && ["===", "!==", "==", "!="].includes(parent.operator)) return;
      opaque(node, kind === "bun" ? "use of the Bun object" : "use of the global object");
    }

    const checkSource = (node) => {
      if (isChildProcess(node.source)) {
        context.report({ node, messageId: "childProcess", data: { source: node.source.value } });
      }
    };
    return {
      ImportDeclaration(node) {
        checkSource(node);
        if (!isBunSource(node.source)) return;
        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportSpecifier") {
            const name = keyName(specifier.imported, false);
            if (SPAWNERS.has(name)) report(specifier, name);
          } else {
            followVariable(sourceCode.getDeclaredVariables(specifier)[0], "bun");
          }
        }
      },
      ExportAllDeclaration(node) {
        checkSource(node);
        if (isBunSource(node.source)) opaque(node, "re-export of \"bun\"");
      },
      ExportNamedDeclaration(node) {
        checkSource(node);
        if (!isBunSource(node.source)) return;
        for (const specifier of node.specifiers) {
          const name = keyName(specifier.local, false);
          if (SPAWNERS.has(name)) report(specifier, name);
          else if (name === "default") opaque(specifier, "re-export of \"bun\"");
        }
      },
      ImportExpression(node) {
        if (isChildProcess(node.source)) {
          context.report({ node, messageId: "childProcess", data: { source: node.source.value } });
        } else if (isBunSource(node.source)) {
          if (node.parent.type === "AwaitExpression") track(node.parent, "bun");
          else opaque(node, "import(\"bun\") without await");
        }
      },
      CallExpression(node) {
        if (node.callee.type !== "Identifier" || node.callee.name !== "require") return;
        const [arg] = node.arguments;
        if (isChildProcess(arg)) context.report({ node, messageId: "childProcess", data: { source: arg.value } });
        else if (isBunSource(arg)) track(node, "bun");
      },
      "Program:exit"(program) {
        // Only the unshadowed globals: a local `window` or `Bun` is someone else's value.
        const globalScope = sourceCode.getScope(program);
        const references = [...globalScope.through];
        for (const name of ["Bun", ...GLOBAL_OBJECTS]) references.push(...(globalScope.set.get(name)?.references ?? []));
        for (const { identifier } of new Set(references)) {
          if (identifier.name === "Bun") track(identifier, "bun");
          else if (GLOBAL_OBJECTS.includes(identifier.name)) track(identifier, "global");
        }
      },
    };
  },
};
