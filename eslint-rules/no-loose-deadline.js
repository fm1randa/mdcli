// A test that writes 10_000 or Bun.sleep(100) drifts from the suite budget and
// times out under load (#248, #303). test/timeouts.ts is the only file that
// may contain those numbers. The follow is one binding deep: a second local
// and an arithmetic initializer stay review. setTimeout is a macrotask or a
// scripted delay, not a suite deadline, so it is not a site.
import { keyName, memberName } from "./lib/static-member.js";

const TIMEOUT_NAME = /timeout|deadline/i;
const WRAPPERS = new Set([
  "TSAsExpression",
  "TSNonNullExpression",
  "TSTypeAssertion",
  "TSSatisfiesExpression",
  "ChainExpression",
  "ParenthesizedExpression",
]);

const unwrap = (node) => {
  let current = node;
  while (current && WRAPPERS.has(current.type)) current = current.expression;
  return current;
};

const isNumericLiteral = (node) => {
  const value = unwrap(node);
  return value?.type === "Literal" && typeof value.value === "number";
};

export default {
  meta: {
    type: "problem",
    docs: { description: "Ban a handwritten test deadline outside test/timeouts.ts" },
    messages: {
      loose:
        "Use a duration from test/timeouts.ts (waitFor, POLL_DEADLINE_MS, QUIET_WINDOW_MS) instead of a handwritten number.",
    },
    schema: [],
  },
  create(context) {
    const { sourceCode } = context;

    const variableFor = (identifier) => {
      let scope = sourceCode.getScope(identifier);
      while (scope) {
        const variable = scope.set.get(identifier.name);
        if (variable) return variable;
        scope = scope.upper;
      }
      return undefined;
    };

    const isLoose = (node) => {
      const value = unwrap(node);
      if (!value) return false;
      if (isNumericLiteral(value)) return true;
      if (value.type !== "Identifier") return false;
      const def = variableFor(value)?.defs[0];
      if (!def || def.type !== "Variable" || def.node.type !== "VariableDeclarator") return false;
      return isNumericLiteral(def.node.init);
    };

    const report = (node) => context.report({ node, messageId: "loose" });

    const checkNamedInit = (id, init) => {
      if (id?.type !== "Identifier" || !TIMEOUT_NAME.test(id.name) || !init || !isLoose(init)) return;
      report(init);
    };

    const checkParam = (param) => {
      if (param.type === "AssignmentPattern") checkNamedInit(param.left, param.right);
    };

    const isTimeoutKey = (key, computed) => keyName(key, computed) === "timeout";

    const isNow = (node) => {
      const value = unwrap(node);
      if (value?.type !== "CallExpression") return false;
      const callee = unwrap(value.callee);
      if (callee?.type !== "MemberExpression" || memberName(callee) !== "now") return false;
      const object = callee.object;
      return object.type === "Identifier" && (object.name === "Date" || object.name === "performance");
    };

    const isBunObject = (node) => {
      const value = unwrap(node);
      if (value?.type === "Identifier" && value.name === "Bun") return true;
      if (value?.type !== "MemberExpression" || memberName(value) !== "Bun") return false;
      return (
        value.object.type === "Identifier" &&
        ["globalThis", "global", "self", "window"].includes(value.object.name)
      );
    };

    const isBunSleep = (callee) => {
      const value = unwrap(callee);
      return value?.type === "MemberExpression" && memberName(value) === "sleep" && isBunObject(value.object);
    };

    return {
      CallExpression(node) {
        if (!isBunSleep(node.callee) || node.arguments.length === 0) return;
        if (isLoose(node.arguments[0])) report(node.arguments[0]);
      },
      VariableDeclarator(node) {
        checkNamedInit(node.id, node.init);
      },
      AssignmentExpression(node) {
        if (node.left.type === "Identifier") {
          checkNamedInit(node.left, node.right);
          return;
        }
        if (node.left.type === "MemberExpression" && isTimeoutKey(node.left.property, node.left.computed) && isLoose(node.right)) {
          report(node.right);
        }
      },
      Property(node) {
        if (!isTimeoutKey(node.key, node.computed) || !isLoose(node.value)) return;
        report(node.value);
      },
      FunctionDeclaration(node) {
        node.params.forEach(checkParam);
      },
      FunctionExpression(node) {
        node.params.forEach(checkParam);
      },
      ArrowFunctionExpression(node) {
        node.params.forEach(checkParam);
      },
      BinaryExpression(node) {
        if (node.operator !== "+") return;
        if (isNow(node.left) && isLoose(node.right)) report(node.right);
        if (isNow(node.right) && isLoose(node.left)) report(node.left);
      },
    };
  },
};
