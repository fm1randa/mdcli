// A card's due date is read only in card-invoice.ts (Jardinagem 2026-10-21:
// three paths had three fallbacks for a card without one). There,
// cardDueAnchor falls back to primeiraFatura and ownDueDate (the Import) has
// no fallback, so the Import fails for a card without one. Bans
// every read of proximoVencimento, not just `proximoVencimento ??`: `?.`,
// `||`, ternaries and `if (!x) throw` were all ways around the old selector.
const FIELD = "proximoVencimento";

function isField(key, computed) {
  if (computed) return key.type === "Literal" && key.value === FIELD;
  return key.type === "Identifier" && key.name === FIELD;
}

export default {
  meta: {
    type: "problem",
    docs: { description: "Ban reading proximoVencimento outside card-invoice.ts" },
    messages: {
      dueAnchor:
        "Read a card's due date through src/commands/entries/card-invoice.ts: cardDueAnchor (falls back to primeiraFatura) or ownDueDate (null without one; the Import fails).",
    },
    schema: [],
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (isField(node.property, node.computed)) context.report({ node, messageId: "dueAnchor" });
      },
      // `const { proximoVencimento } = card` reads it too.
      "ObjectPattern > Property"(node) {
        if (isField(node.key, node.computed)) context.report({ node, messageId: "dueAnchor" });
      },
    };
  },
};
