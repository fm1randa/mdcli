// Loose number coercion. Number('') is 0, Number('1e3') 1000, Number('0x10')
// 16: strings go through the strict helpers instead (Jardinagem 2026-10-19).
// parseInt and parseFloat stop at the first bad character ('12abc' is 12)
// and unary + is Number() in disguise (+'' is 0), so they are banned too
// (Jardinagem 2026-10-26). Number passed as a value, as in .map(Number), calls
// Number() on each item, so it is banned as well; Number.isSafeInteger and the
// other members are fine. src/utils/parse.ts, where the helpers live, is out of
// scope.
const PARSERS = new Set(["parseInt", "parseFloat"]);

function isParser(callee) {
  if (callee.type === "Identifier") return PARSERS.has(callee.name);
  return (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.object.type === "Identifier" &&
    callee.object.name === "Number" &&
    callee.property.type === "Identifier" &&
    PARSERS.has(callee.property.name)
  );
}

// Number read as a value: not called (reported as numberCall), not the object
// of Number.x, not a property name (x.Number, { Number: 1 }) and not a type.
function isNumberValue(node) {
  const { parent } = node;
  if (parent.type === "CallExpression" && parent.callee === node) return false;
  if (parent.type === "MemberExpression") return parent.computed && parent.property === node;
  if (parent.type === "Property" && parent.key === node && !parent.computed && !parent.shorthand) return false;
  return !parent.type.startsWith("TS");
}

export default {
  meta: {
    type: "problem",
    docs: { description: "Ban Number(...), parseInt, parseFloat and unary +; use the strict parse helpers" },
    messages: {
      numberCall: "Number() accepts '', '1e3', '0x10' and 'Infinity'. Use parseId, parseInteger or parseAmount from src/utils/parse.ts.",
      parseCall: "parseInt/parseFloat accept '12abc' as 12. Use parseId, parseInteger or parseAmount from src/utils/parse.ts.",
      numberValue:
        "Number passed as a function, as in .map(Number), calls Number() on each item ('' is 0, '1e3' is 1000). Map with parseId, parseInteger or parseAmount from src/utils/parse.ts.",
      unaryPlus:
        "Unary + is Number() ('' is 0, '1e3' is 1000). Parse a string with parseId, parseInteger or parseAmount from src/utils/parse.ts; if it is already a number, drop the +.",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "Number") {
          context.report({ node, messageId: "numberCall" });
        } else if (isParser(node.callee)) {
          context.report({ node, messageId: "parseCall" });
        }
      },
      Identifier(node) {
        if (node.name !== "Number" || !isNumberValue(node)) return;
        context.report({ node, messageId: "numberValue" });
      },
      UnaryExpression(node) {
        // +1 is a number already; +x coerces.
        if (node.operator === "+" && !(node.argument.type === "Literal" && typeof node.argument.value === "number")) {
          context.report({ node, messageId: "unaryPlus" });
        }
      },
    };
  },
};
