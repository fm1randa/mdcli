// An Error the CLI builds reaches the user as its message, so its text comes
// from the i18n catalogs like every other line the CLI prints. English text
// written in place kept coming back (#326, #327, #346, #350): this rule refuses
// `new Error(<text>)` and `Error(<text>)` when the message is a string literal,
// a template literal, or a `+` concatenation that contains one. A message
// passed through (`new Error(t('key'))`, `new Error(message)`) is not text.

function isRawText(node) {
  if (!node) return false;
  if (node.type === "Literal") return typeof node.value === "string";
  if (node.type === "TemplateLiteral") return true;
  if (node.type === "BinaryExpression" && node.operator === "+") {
    return isRawText(node.left) || isRawText(node.right);
  }
  return false;
}

export default {
  meta: {
    type: "problem",
    docs: { description: "Build Error messages from the i18n catalog, never from text written in place" },
    messages: {
      rawMessage:
        "Error message written in place. Write `new Error(t('errorKey', ...args))` and add errorKey to both catalogs (src/lib/i18n/catalog/pt-BR and en). When the throw cannot happen, remove it by narrowing the type (e.g. a constructor that cannot return null), not with a guard.",
    },
    schema: [],
  },
  create(context) {
    function check(node) {
      if (node.callee.type !== "Identifier" || node.callee.name !== "Error") return;
      if (isRawText(node.arguments[0])) context.report({ node, messageId: "rawMessage" });
    }
    return { NewExpression: check, CallExpression: check };
  },
};
