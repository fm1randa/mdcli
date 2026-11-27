// An Error the CLI builds reaches the user as its message, so its text comes
// from the i18n catalogs like every other line the CLI prints. English text
// written in place kept coming back (#326, #327, #346, #350), and a list of the
// bad forms let the next form through (a ternary, `.join()`, `String()`,
// `globalThis.Error`, #361). So the rule names what is accepted instead: the
// message of `Error(...)` or `new Error(...)`, read from `Error` or from a
// global object (`globalThis.Error`, `global["Error"]`), is absent, a `t(...)`
// call, a name holding a message built elsewhere, or a ternary between two of
// those. A thrown string is `@typescript-eslint/only-throw-error`'s job.
import { memberName } from "./static-member.js";

const GLOBALS = new Set(["globalThis", "global", "self", "window"]);

function isErrorConstructor(callee) {
  if (callee.type === "Identifier") return callee.name === "Error";
  return (
    callee.type === "MemberExpression" &&
    callee.object.type === "Identifier" &&
    GLOBALS.has(callee.object.name) &&
    memberName(callee) === "Error"
  );
}

function isAcceptedMessage(node) {
  if (!node) return true;
  if (node.type === "Identifier") return true;
  if (node.type === "ConditionalExpression") return isAcceptedMessage(node.consequent) && isAcceptedMessage(node.alternate);
  return node.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "t";
}

export default {
  meta: {
    type: "problem",
    docs: { description: "Build Error messages from the i18n catalog, never from text written in place" },
    messages: {
      rawMessage:
        "Error message not taken from the catalog. Write `new Error(t('errorKey', ...args))` and add errorKey to both catalogs (src/lib/i18n/catalog/pt-BR and en); a ternary chooses between two t() calls, and a list is joined inside the t() arguments. When the throw cannot happen, remove it by narrowing the type (e.g. a constructor that cannot return null), not with a guard.",
    },
    schema: [],
  },
  create(context) {
    function check(node) {
      if (!isErrorConstructor(node.callee)) return;
      if (!isAcceptedMessage(node.arguments[0])) context.report({ node, messageId: "rawMessage" });
    }
    return { NewExpression: check, CallExpression: check };
  },
};
