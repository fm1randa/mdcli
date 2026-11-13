// scripts/git.ts became the owner of child processes (#260), yet each gate
// kept its own `--base` parser (silently falling back to origin/main when the
// value was missing), its own `base...HEAD` diff, and each test its own git
// wrapper without core.quotepath=false or a checked exit code (#268). The
// `--head` parser and a two-dot diff survived that sweep (#286).
const OWNER = "scripts/git.ts";
const REVISION_FLAGS = new Set(["--base", "--head"]);
const FLAG_LOOKUPS = new Set(["indexOf", "lastIndexOf", "includes", "startsWith", "findIndex"]);

const isString = (node, value) => node?.type === "Literal" && node.value === value;
const isRevisionFlag = (node) => node?.type === "Literal" && REVISION_FLAGS.has(node.value);
/** `--base`, `--head`, or `--base=`-style prefixes of them. */
const startsWithRevisionFlag = (node) =>
  node?.type === "Literal" && typeof node.value === "string" && [...REVISION_FLAGS].some((flag) => node.value.startsWith(flag));
const isDots = (value) => value === ".." || value === "...";

/** `${base}...HEAD` or `${base}..HEAD`: a revision range, the shape diffAgainst owns. */
const isRangeTemplate = (node) =>
  node.type === "TemplateLiteral" && node.quasis.some((quasi, index) => index > 0 && quasi.value.cooked.startsWith(".."));
/** base + '...HEAD', or base + '..' + head. */
const isRangeConcat = (node) =>
  node.type === "BinaryExpression" &&
  node.operator === "+" &&
  node.right.type === "Literal" &&
  typeof node.right.value === "string" &&
  node.right.value.startsWith("..");
/** ['diff', ..., base, head]: a diff against a revision held in a variable, two dots or not. */
const isRevisionDiff = (node) =>
  isString(node.elements[0], "diff") &&
  node.elements.some((element) => element?.type === "Identifier" || element?.type === "MemberExpression");

export default {
  meta: {
    type: "problem",
    docs: { description: `Parse --base/--head, diff against a base and run git only through ${OWNER}` },
    messages: {
      rawGit: `Run git through ${OWNER} (git, gitBytes, gitResult, gitQuiet); it owns core.quotepath=false and the error text with git's stderr.`,
      revisionFlag: `Parse --base with parseBase and --head with parseRevisionFlag from ${OWNER}; they own the origin/main default and fail when the value is missing or is another flag.`,
      range: `Build a revision range through ${OWNER}: diffAgainst owns the base...head diff (WORKING_TREE for the files on disk) and the flags every gate's parser expects; logRange owns base..head for git log.`,
    },
    schema: [],
  },
  create(context) {
    return {
      ArrayExpression(node) {
        if (isString(node.elements[0], "git")) context.report({ node, messageId: "rawGit" });
        if (isRevisionDiff(node)) context.report({ node, messageId: "range" });
        for (const element of node.elements) {
          if (element && isRangeTemplate(element)) context.report({ node: element, messageId: "range" });
        }
      },
      VariableDeclarator(node) {
        if (isString(node.init, "git")) context.report({ node, messageId: "rawGit" });
      },
      CallExpression(node) {
        if (isString(node.arguments[0], "git")) context.report({ node, messageId: "rawGit" });
        const { callee } = node;
        if (callee.type !== "MemberExpression" || callee.computed || callee.property.type !== "Identifier") return;
        if (FLAG_LOOKUPS.has(callee.property.name) && startsWithRevisionFlag(node.arguments[0])) {
          context.report({ node, messageId: "revisionFlag" });
        }
        if (callee.property.name === "join" && node.arguments[0]?.type === "Literal" && isDots(node.arguments[0].value)) {
          context.report({ node, messageId: "range" });
        }
      },
      BinaryExpression(node) {
        if (isRangeConcat(node)) context.report({ node, messageId: "range" });
        if ((node.operator === "===" || node.operator === "==") && (isRevisionFlag(node.left) || isRevisionFlag(node.right))) {
          context.report({ node, messageId: "revisionFlag" });
        }
      },
      SwitchCase(node) {
        if (isRevisionFlag(node.test)) context.report({ node, messageId: "revisionFlag" });
      },
    };
  },
};
