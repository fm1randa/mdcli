// A flag value read as `argv[++index]` takes whatever comes next, so
// `--running --package-manager bun@1.4.2` set the version to
// `--package-manager` (#353). The same hand-written loop kept coming back in
// new gates after #268 and #286, so the read itself is banned.
export default {
  meta: {
    type: "problem",
    docs: {
      description: "Flag values are read through parseValueFlag, not by stepping an index inside a member read (#353)",
    },
    messages: {
      handArgv:
        "Reading a flag value with argv[++index] swallows the next flag as the value (#353). Take each value flag with parseValueFlag(argv, '--flag', 'a value') from scripts/git.ts (parseValueFlags for a repeatable flag), which refuses a missing value or one that looks like a flag, then walk the returned rest for booleans and unknown arguments.",
    },
    schema: [],
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (node.computed && node.property.type === "UpdateExpression") {
          context.report({ node, messageId: "handArgv" });
        }
      },
    };
  },
};
