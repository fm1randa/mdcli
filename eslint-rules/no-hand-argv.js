// A flag value read as `argv[++index]` takes whatever comes next, so
// `--running --package-manager bun@1.4.2` set the version to
// `--package-manager` (#353). The same hand-written loop kept coming back in
// new gates after #268 and #286, so the read itself is banned. Banning only
// `++`/`--` inside the brackets let `argv[(i += 1)]`, `argv.at(++i)` and
// `argv.splice(i, 2)[1]` through (#361), so the rule refuses any index that
// moves a counter while it reads, and any value taken out of a `.splice()`.
import { memberName } from "./static-member.js";

/** An update or assignment inside `node`, outside a nested function. */
function steps(node) {
  if (!node || typeof node.type !== "string") return false;
  if (node.type === "UpdateExpression" || node.type === "AssignmentExpression") return true;
  if (node.type.includes("Function")) return false;
  return Object.entries(node).some(([key, value]) => {
    if (key === "parent") return false;
    if (Array.isArray(value)) return value.some(steps);
    return value !== null && typeof value === "object" && steps(value);
  });
}

const READ_METHODS = new Set(["at", "slice", "splice"]);

const methodName = (call) => (call.callee.type === "MemberExpression" ? memberName(call.callee) : undefined);

/** `x.splice(...)` whose removed items are read: indexed, read by a method, or destructured. */
function readsSplice(call) {
  const { parent } = call;
  if (parent.type === "MemberExpression" && parent.object === call) return true;
  if (parent.type === "VariableDeclarator" && parent.init === call) return parent.id.type === "ArrayPattern";
  if (parent.type === "AssignmentExpression" && parent.right === call) return parent.left.type === "ArrayPattern";
  return false;
}

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Flag values are read through parseValueFlag, not by stepping an index inside a read (#353, #361)",
    },
    messages: {
      handArgv:
        "Reading a flag value with argv[++index] (or argv[(i += 1)], argv.at(++i), argv.splice(i, 2)[1]) swallows the next flag as the value (#353). Take each value flag with parseValueFlag(argv, '--flag', 'a value') from scripts/git.ts (parseValueFlags for a repeatable flag), which refuses a missing value or one that looks like a flag, then walk the returned rest for booleans and unknown arguments.",
    },
    schema: [],
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (node.computed && steps(node.property)) context.report({ node, messageId: "handArgv" });
      },
      CallExpression(node) {
        const name = methodName(node);
        if (!READ_METHODS.has(name)) return;
        if (node.arguments.some(steps) || (name === "splice" && readsSplice(node))) {
          context.report({ node, messageId: "handArgv" });
        }
      },
    };
  },
};
