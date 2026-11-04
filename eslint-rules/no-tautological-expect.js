// A test that cannot fail proves nothing (issue #186). The two forms that
// repeated in this repo: a literal compared to itself (#152 wrote
// `expect(true).toBe(true)`) and an assertion over the text of a src/ or bin/
// file (#152 also asserted that "preprocessShortOptions" appeared in
// bin/cli.ts). Assert observable behavior through the CLI instead.
const SAME_VALUE_MATCHERS = new Set(["toBe", "toEqual", "toStrictEqual"]);
const SOURCE_PATH = /(^|\/)(src|bin)\//;

/** The value of a primitive literal (or `undefined`), else null. */
function literalValue(node) {
  if (node?.type === "Literal") return { value: node.value };
  if (node?.type === "Identifier" && node.name === "undefined") return { value: undefined };
  return null;
}

/** The text of a string literal or of a template literal with no expressions, else null. */
function staticText(node) {
  if (node?.type === "Literal" && typeof node.value === "string") return node.value;
  if (node?.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0].value.cooked;
  return null;
}

function sameLiteral(left, right) {
  const a = literalValue(left);
  const b = literalValue(right);
  return a !== null && b !== null && Object.is(a.value, b.value);
}

/** True for a string literal (or a join() segment) that names a src/ or bin/ file. */
function namesSourceFile(node) {
  const text = staticText(node);
  if (text !== null) return SOURCE_PATH.test(text);
  if (node?.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "join") {
    return node.arguments.some(namesSourceFile);
  }
  return false;
}

/** True for readFileSync(path), readFile(path) or Bun.file(path).text() on a src/ or bin/ file. */
function readsSourceFile(node) {
  if (node?.type === "AwaitExpression") return readsSourceFile(node.argument);
  if (node?.type !== "CallExpression") return false;
  const { callee } = node;
  if (callee.type === "Identifier" && (callee.name === "readFileSync" || callee.name === "readFile")) {
    return namesSourceFile(node.arguments[0]);
  }
  if (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.name === "text" &&
    callee.object.type === "CallExpression" &&
    callee.object.callee.type === "MemberExpression" &&
    !callee.object.callee.computed &&
    callee.object.callee.object.type === "Identifier" &&
    callee.object.callee.object.name === "Bun" &&
    callee.object.callee.property.name === "file"
  ) {
    return namesSourceFile(callee.object.arguments[0]);
  }
  return false;
}

/** The expect() call and matcher name behind expect(...).toBe(...) / expect(...).not.toBe(...). */
function matcherCall(node) {
  if (node.type !== "CallExpression" || node.callee.type !== "MemberExpression") return null;
  const { callee } = node;
  const matcher = callee.computed
    ? callee.property.type === "Literal"
      ? String(callee.property.value)
      : null
    : callee.property.name;
  let object = callee.object;
  if (object.type === "MemberExpression" && !object.computed && object.property.name === "not") {
    object = object.object;
  }
  if (object.type === "CallExpression" && object.callee.type === "Identifier" && object.callee.name === "expect") {
    return { matcher, expectCall: object };
  }
  return null;
}

export default {
  meta: {
    type: "problem",
    docs: { description: "Ban a literal compared to itself and assertions over the text of src/ or bin/" },
    messages: {
      sameLiteral: "This compares a literal to itself and can never fail. Assert observable behavior instead.",
      sourceText:
        "This asserts the text of a src/ or bin/ file instead of its behavior. Run the CLI (runCli against the mock) and assert its output.",
    },
    schema: [],
  },
  create(context) {
    const sourceVariables = new Set();

    function referencesSource(node) {
      if (!node) return false;
      if (node.type === "Identifier") return sourceVariables.has(node.name);
      if (node.type === "AwaitExpression") return referencesSource(node.argument);
      if (node.type === "TemplateLiteral") return node.expressions.some(referencesSource);
      if (node.type === "MemberExpression") return referencesSource(node.object);
      if (node.type === "CallExpression") {
        return referencesSource(node.callee) || node.arguments.some(referencesSource);
      }
      return false;
    }

    return {
      VariableDeclarator(node) {
        if (node.id.type === "Identifier" && readsSourceFile(node.init)) {
          sourceVariables.add(node.id.name);
        }
      },
      CallExpression(node) {
        const info = matcherCall(node);
        if (!info) return;
        const [actual] = info.expectCall.arguments;
        const [expected] = node.arguments;
        if (SAME_VALUE_MATCHERS.has(info.matcher) && sameLiteral(actual, expected)) {
          context.report({ node, messageId: "sameLiteral" });
          return;
        }
        if (readsSourceFile(actual) || referencesSource(actual)) {
          context.report({ node, messageId: "sourceText" });
        }
      },
    };
  },
};
