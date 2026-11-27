// `JSON.parse(data) as MdcliConfig` read a hand-editable file straight into a
// typed value: a `null` or a wrong field there crashed the command that read it
// (#362). What JSON.parse, `.json()` or a `get(...)` hands back is unchecked
// data from a file, a child process or the network; validate it, never cast it.

const UNWRAP = new Set(["AwaitExpression", "ChainExpression", "TSNonNullExpression"]);
const ASSERTIONS = new Set(["TSAsExpression", "TSTypeAssertion", "TSSatisfiesExpression"]);

function name(node) {
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  return undefined;
}

/** The call under awaits, `?.`, `!` and casts to `unknown`, or undefined. */
function source(node) {
  let current = node;
  for (;;) {
    if (UNWRAP.has(current.type)) current = current.argument ?? current.expression;
    else if (ASSERTIONS.has(current.type) && current.typeAnnotation.type === "TSUnknownKeyword") current = current.expression;
    else break;
  }
  if (current.type !== "CallExpression") return undefined;
  const callee = current.callee.type === "ChainExpression" ? current.callee.expression : current.callee;
  if (callee.type === "Identifier") return callee.name === "get" ? "get(...)" : undefined;
  if (callee.type !== "MemberExpression") return undefined;
  const method = name(callee.property);
  if (method === "get") return ".get(...)";
  if (method === "json") return ".json()";
  if (method !== "parse") return undefined;
  const owner = callee.object.type === "MemberExpression" ? name(callee.object.property) : name(callee.object);
  return owner === "JSON" ? "JSON.parse(...)" : undefined;
}

export default {
  meta: {
    type: "problem",
    docs: { description: "Ban casting what JSON.parse, .json() or get(...) returns instead of validating it" },
    messages: {
      cast:
        "Do not cast what {{source}} returns: {{form}} checks nothing at runtime. Read it as `unknown` (`const value: unknown = ...`) and narrow it field by field with the readers in src/lib/payload.ts (asRecord, textOrNull, numberOrNull), as parseConfig in src/lib/config-shape.ts does, falling back to the default or throwing a clear t() error when it does not match.",
    },
    schema: [],
  },
  create(context) {
    function check(node) {
      if (node.typeAnnotation.type === "TSUnknownKeyword") return;
      const from = source(node.expression);
      if (!from) return;
      const form = node.type === "TSSatisfiesExpression" ? "`satisfies`" : node.type === "TSTypeAssertion" ? "`<T>`" : "`as`";
      context.report({ node, messageId: "cast", data: { source: from, form } });
    }
    return { TSAsExpression: check, TSTypeAssertion: check, TSSatisfiesExpression: check };
  },
};
