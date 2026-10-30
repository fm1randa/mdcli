export default {
  meta: {
    type: "problem",
    docs: {
      description: "Short options with = must be preprocessed before commander parses argv (#151)",
    },
    messages: {
      missingPreprocess:
        "argv must pass through preprocessShortOptions before program.parseAsync: -v=value fails because commander only treats = as separator for long options. Call preprocessShortOptions(argv) in bin/cli.ts.",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        // Check for program.parseAsync(argv) or .parseAsync() without preprocess
        if (node.callee.type === "MemberExpression") {
          const prop = node.callee.property;
          if (prop.type === "Identifier" && prop.name === "parseAsync") {
            const args = node.arguments;
            const arg0 = args[0];
            const isDirectCall = arg0?.type === "CallExpression" &&
              arg0.callee?.type === "Identifier" && arg0.callee.name === "preprocessShortOptions";
            const isPreprocessedVar = arg0?.type === "Identifier" && arg0.name === "argv";
            if (!isDirectCall && !isPreprocessedVar) {
              // Only flag on the CLI entry point
              const fileName = context.filename || context.getFilename();
              if (fileName.endsWith("bin/cli.ts") || fileName.includes("cli")) {
                context.report({ node, messageId: "missingPreprocess" });
              }
            }
          }
        }
      },
    };
  },
};
