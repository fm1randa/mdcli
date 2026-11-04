// Bare process.exit() exits before stdout is drained to the pipe, so piped
// output is truncated at the kernel buffer size (65536 bytes). The only
// sanctioned exit is exitAfterFlush() in src/utils/action.ts, which flushes
// stdout first (#155); a copied eslint-disable is not a fix (#187).
const EXIT_OWNER = /[\\/]src[\\/]utils[\\/]action\.ts$/;

function insideExitAfterFlush(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (
      (parent.type === "FunctionDeclaration" ||
        parent.type === "FunctionExpression" ||
        parent.type === "ArrowFunctionExpression") &&
      parent.id?.name === "exitAfterFlush"
    ) {
      return true;
    }
  }
  return false;
}

export default {
  meta: {
    type: "problem",
    docs: { description: "Ban process.exit() outside exitAfterFlush(), which drains stdout first" },
    messages: {
      bareExit:
        "Call exitAfterFlush(code) from src/utils/action.ts instead of process.exit(); it flushes stdout so piped output isn't truncated at 65536 bytes.",
    },
    schema: [],
  },
  create(context) {
    const isExitOwner = EXIT_OWNER.test(context.filename);
    return {
      CallExpression(node) {
        const { callee } = node;
        if (
          callee.type === "MemberExpression" &&
          callee.object.type === "Identifier" &&
          callee.object.name === "process" &&
          callee.property.type === "Identifier" &&
          callee.property.name === "exit"
        ) {
          if (isExitOwner && insideExitAfterFlush(node)) return;
          context.report({ node, messageId: "bareExit" });
        }
      },
    };
  },
};
