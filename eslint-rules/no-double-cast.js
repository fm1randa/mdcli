// `as unknown as` hid that the update payload did not match its type, right
// where the -p status bug lived (Jardinagem 2026-10-21): fix the type instead.
export default {
  meta: {
    type: "problem",
    docs: { description: "Ban `as unknown as` double casts" },
    messages: {
      doubleCast: "`as unknown as` hides a type mismatch. Make the value match the type (or fix the type in src/types).",
    },
    schema: [],
  },
  create(context) {
    return {
      TSAsExpression(node) {
        const inner = node.expression;
        if (inner.type === "TSAsExpression" && inner.typeAnnotation.type === "TSUnknownKeyword") {
          context.report({ node: inner, messageId: "doubleCast" });
        }
      },
    };
  },
};
