// A category name is resolved only in src/lib/category-resolution.ts
// (2026-11-04: entries and categories --move-to each grew the same
// "prefer the active category" filter, and #77 and #172 gave them different
// failures for the same name). Bans matching a name next to a status check,
// which is how both copies reimplemented resolveCategoryReference.
// Same-name matching without a status check (the --edit file) is not a
// resolution and stays allowed.
const FUNCTION_TYPES = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);

function sameNameCall(node) {
  return (
    node.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    node.callee.name === "sameName"
  );
}

function readsStatus(node) {
  const seen = new Set();
  const stack = [node];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === null || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }
    if (
      current.type === "MemberExpression" &&
      ((current.computed && current.property.type === "Literal" && current.property.value === "status") ||
        (!current.computed && current.property.type === "Identifier" && current.property.name === "status"))
    ) {
      return true;
    }
    for (const [key, value] of Object.entries(current)) {
      if (key !== "parent") stack.push(value);
    }
  }
  return false;
}

function enclosingScope(node) {
  let current = node.parent;
  while (current && !FUNCTION_TYPES.has(current.type) && current.type !== "Program") {
    current = current.parent;
  }
  return current;
}

export default {
  meta: {
    type: "problem",
    docs: { description: "Ban reimplementing category name resolution outside its owner" },
    messages: {
      owner:
        "Resolve a category through src/lib/category-resolution.ts: resolveCategoryReference (an active name wins, an ambiguous name is refused, an inactive destination is refused).",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!sameNameCall(node)) return;
        const scope = enclosingScope(node);
        if (scope && readsStatus(scope)) context.report({ node, messageId: "owner" });
      },
    };
  },
};
