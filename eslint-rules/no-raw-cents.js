// Cents are computed in one place: checkWrittenValue in the import plan had
// its own Math.round(Math.abs(value) * 100) next to toCents (Jardinagem
// 2026-10-26). Bans Math.round(... * 100), either operand order.
function isHundred(node) {
  return node.type === "Literal" && node.value === 100;
}

export default {
  meta: {
    type: "problem",
    docs: { description: "Ban Math.round(x * 100); use the cents helpers in src/utils/currency.ts" },
    messages: {
      rawCents: "Use toCents (magnitude in cents) or roundToCents (signed, rounded to cents) from src/utils/currency.ts.",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const { callee, arguments: args } = node;
        if (callee.type !== "MemberExpression" || callee.computed) return;
        if (callee.object.type !== "Identifier" || callee.object.name !== "Math") return;
        if (callee.property.type !== "Identifier" || callee.property.name !== "round") return;
        const [arg] = args;
        if (arg?.type === "BinaryExpression" && arg.operator === "*" && (isHundred(arg.left) || isHundred(arg.right))) {
          context.report({ node, messageId: "rawCents" });
        }
      },
    };
  },
};
