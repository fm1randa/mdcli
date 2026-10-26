// An argument-less new Date() or Date.now() reads the machine's clock, so a
// test cannot move "today" and a date check turns into a time bomb (tests
// passing fixed dates broke once the 90-day --since window moved past them,
// Jardineiro 2026-10-26). Commands read the day through src/lib/dates.ts.
export default {
  meta: {
    type: "problem",
    docs: { description: "Ban new Date() and Date.now() without arguments in commands; use now() or today()" },
    messages: {
      ambientClock: "Read the clock through now() or today() from src/lib/dates.ts, which tests can pin with MDCLI_TODAY.",
    },
    schema: [],
  },
  create(context) {
    // Date itself, or globalThis.Date, which reads the same clock.
    const isDate = (node) =>
      (node.type === "Identifier" && node.name === "Date") ||
      (node.type === "MemberExpression" &&
        !node.computed &&
        node.object.type === "Identifier" &&
        node.object.name === "globalThis" &&
        node.property.name === "Date");
    // .now or ['now'].
    const isNow = (node) =>
      node.computed
        ? node.property.type === "Literal" && node.property.value === "now"
        : node.property.name === "now";
    return {
      NewExpression(node) {
        if (isDate(node.callee) && node.arguments.length === 0) {
          context.report({ node, messageId: "ambientClock" });
        }
      },
      CallExpression(node) {
        const { callee } = node;
        if (
          callee.type === "MemberExpression" &&
          isDate(callee.object) &&
          isNow(callee)
        ) {
          context.report({ node, messageId: "ambientClock" });
        }
      },
    };
  },
};
