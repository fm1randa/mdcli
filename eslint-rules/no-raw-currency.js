// Money is formatted in one place, signed by default (Jardinagem 2026-10-19:
// four copies, two of them dropping the sign).
export default {
  meta: {
    type: "problem",
    docs: { description: "Ban toLocaleString with style 'currency' outside src/utils/currency.ts" },
    messages: {
      rawCurrency: "Format money with formatCurrency (signed) or formatMagnitude from src/utils/currency.ts.",
    },
    schema: [],
  },
  create(context) {
    return {
      Property(node) {
        if (node.key.type !== "Identifier" || node.key.name !== "style") return;
        if (node.value.type !== "Literal" || node.value.value !== "currency") return;
        const inToLocaleString = context.sourceCode
          .getAncestors(node)
          .some((a) => a.type === "CallExpression" && a.callee.type === "MemberExpression" && a.callee.property.name === "toLocaleString");
        if (inToLocaleString) context.report({ node, messageId: "rawCurrency" });
      },
    };
  },
};
