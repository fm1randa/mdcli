// A copied eslint-disable is how the bare-exit pattern spread (#155, #187).
// Every directive states why the exception is safe after "--", so a reviewer
// sees the reason next to the rule instead of a bare suppression.
const DIRECTIVE = /^\s*eslint-disable(?:-next-line|-line)?\b/;

export default {
  meta: {
    type: "problem",
    docs: { description: "Require a reason after \"--\" in every eslint-disable directive" },
    messages: {
      missing:
        'Add the reason after "--" to this eslint-disable: `// eslint-disable-next-line <rule> -- <why this exception is safe>`.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const text = comment.value.trim();
          if (DIRECTIVE.test(text) && !/\s--\s+\S/.test(text)) {
            context.report({ loc: comment.loc, messageId: "missing" });
          }
        }
      },
    };
  },
};
