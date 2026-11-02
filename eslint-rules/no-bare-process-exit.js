// Bare process.exit() exits before stdout is drained to the pipe, so piped
// output is truncated at the kernel buffer size (65536 bytes). Flush stdout
// with flushStdout() from src/utils/action.js before calling process.exit().
export default {
  meta: {
    type: "problem",
    docs: { description: "Ban bare process.exit() without draining stdout; flush with flushStdout() first" },
    messages: {
      bareExit: "Flush stdout with flushStdout() before process.exit() so piped output isn't truncated at 65536 bytes.",
    },
    schema: [],
  },
  create(context) {
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
          context.report({ node, messageId: "bareExit" });
        }
      },
    };
  },
};
