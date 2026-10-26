// A test that passes --since a fixed YYYY-MM-DD fails once that day falls out
// of the 90-day window the CLI accepts (Jardineiro 2026-10-26). Tests build
// the date relative to today instead.
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The text of a string literal or of a template literal with no expressions, else null. */
function staticText(node) {
  if (node?.type === "Literal" && typeof node.value === "string") return node.value;
  if (node?.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0].value.cooked;
  return null;
}

export default {
  meta: {
    type: "problem",
    docs: { description: "Ban a literal YYYY-MM-DD right after '--since' in tests; use localDay(offset)" },
    messages: {
      literalSince: "--since only accepts the last 90 days, so a fixed date expires. Use localDay(offset) from test/helpers.ts.",
    },
    schema: [],
  },
  create(context) {
    return {
      ArrayExpression(node) {
        node.elements.forEach((element, index) => {
          if (staticText(element) !== "--since") return;
          const next = node.elements[index + 1];
          const text = staticText(next);
          if (text !== null && ISO_DAY.test(text)) {
            context.report({ node: next, messageId: "literalSince" });
          }
        });
      },
    };
  },
};
