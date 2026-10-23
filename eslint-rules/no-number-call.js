// Number('') is 0, Number('1e3') 1000, Number('0x10') 16: user input goes
// through the strict helpers instead (Jardinagem 2026-10-19).
export default {
  meta: {
    type: "problem",
    docs: { description: "Ban Number(...) calls on user input; use the strict parse helpers" },
    messages: {
      numberCall: "Number() accepts '', '1e3', '0x10' and 'Infinity'. Use parseId, parseInteger or parseAmount from src/utils/parse.ts.",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "Number") {
          context.report({ node, messageId: "numberCall" });
        }
      },
    };
  },
};
