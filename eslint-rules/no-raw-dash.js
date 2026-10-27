// An empty table cell is cell(null) from src/utils/text.ts: the import and
// sync tables repeated chalk.gray('-') next to it (Jardinagem 2026-10-26).
function isChalkGray(callee) {
  return (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.object.type === "Identifier" &&
    callee.object.name === "chalk" &&
    callee.property.type === "Identifier" &&
    callee.property.name === "gray"
  );
}

export default {
  meta: {
    type: "problem",
    docs: { description: "Ban chalk.gray('-'); use cell() from src/utils/text.ts" },
    messages: {
      rawDash: "Use cell(value) or cell(value, format) from src/utils/text.ts: it writes the gray dash for a missing value.",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const [arg] = node.arguments;
        if (isChalkGray(node.callee) && node.arguments.length === 1 && arg.type === "Literal" && arg.value === "-") {
          context.report({ node, messageId: "rawDash" });
        }
      },
    };
  },
};
