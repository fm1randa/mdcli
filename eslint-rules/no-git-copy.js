// scripts/git.ts became the owner of child processes (#260), yet each gate
// kept its own `--base` parser (silently falling back to origin/main when the
// value was missing), its own `base...HEAD` diff, and each test its own git
// wrapper without core.quotepath=false or a checked exit code (#268).
const OWNER = "scripts/git.ts";

const isString = (node, value) => node?.type === "Literal" && node.value === value;

/** `${base}...HEAD`: a merge-base range, the shape diffAgainst owns. */
const isMergeBaseRange = (node) =>
  node.type === "TemplateLiteral" && node.quasis.some((quasi, index) => index > 0 && quasi.value.cooked.startsWith("..."));

export default {
  meta: {
    type: "problem",
    docs: { description: `Parse --base, diff against a base and run git only through ${OWNER}` },
    messages: {
      rawGit: `Run git through ${OWNER} (git, gitBytes, gitResult, gitQuiet, gitAsync); it owns core.quotepath=false and the error text with git's stderr.`,
      baseFlag: `Parse --base with parseBase from ${OWNER}; it owns the origin/main default and fails when the value is missing.`,
      range: `Diff against a base with diffAgainst from ${OWNER}; it owns the base...head range and the flags every gate's parser expects.`,
    },
    schema: [],
  },
  create(context) {
    return {
      ArrayExpression(node) {
        if (isString(node.elements[0], "git")) context.report({ node, messageId: "rawGit" });
        for (const element of node.elements) {
          if (element && isMergeBaseRange(element)) context.report({ node: element, messageId: "range" });
        }
      },
      CallExpression(node) {
        if (isString(node.arguments[0], "git")) context.report({ node, messageId: "rawGit" });
      },
      BinaryExpression(node) {
        if ((node.operator === "===" || node.operator === "==") && (isString(node.left, "--base") || isString(node.right, "--base"))) {
          context.report({ node, messageId: "baseFlag" });
        }
      },
      SwitchCase(node) {
        if (isString(node.test, "--base")) context.report({ node, messageId: "baseFlag" });
      },
    };
  },
};
