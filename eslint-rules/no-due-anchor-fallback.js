// A card's invoice anchor comes from cardDueAnchor alone (Jardinagem
// 2026-10-21: three paths had three fallbacks for a card without one). Bans
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
    docs: { description: "Ban reading proximoVencimento outside cardDueAnchor" },
    messages: {
      dueAnchor: "Use cardDueAnchor (src/commands/entries/card-invoice.ts) for a card's due date: one rule for a card without proximoVencimento.",
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
