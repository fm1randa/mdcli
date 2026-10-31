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
        if (node.callee.type !== "MemberExpression") return;
        const prop = node.callee.property;
        if (prop.type !== "Identifier" || prop.name !== "parseAsync") return;
        if (isPreprocessed(node.arguments[0], context, node)) return;
        context.report({ node, messageId: "missingPreprocess" });
      },
    };
  },
};

function isPreprocessed(arg, context, node) {
  if (!arg) return false;
  if (arg.type === "CallExpression") {
    return arg.callee.type === "Identifier" && arg.callee.name === "preprocessShortOptions";
  }
  if (arg.type !== "Identifier") return false;
  const scope = context.sourceCode ? context.sourceCode.getScope(node) : context.getScope?.();
  const variable = scope?.variables.find((v) => v.name === arg.name);
  const init = variable?.defs?.[0]?.node?.init;
  return init?.type === "CallExpression" &&
    init.callee?.type === "Identifier" &&
    init.callee.name === "preprocessShortOptions";
}
