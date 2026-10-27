// Loose number coercion. Number('') is 0, Number('1e3') 1000, Number('0x10')
// 16: strings go through the strict helpers instead (Jardinagem 2026-10-19).
// parseInt and parseFloat stop at the first bad character ('12abc' is 12)
// and unary + is Number() in disguise (+'' is 0), so they are banned too
// (Jardinagem 2026-10-26). Number, parseInt and parseFloat passed as a value,
// as in .map(Number) or .map(parseInt), run on each item, so they are banned as
// well, and so are new Number() and .call/.apply/.bind on them;
// Number.isSafeInteger and the other members are fine. src/utils/parse.ts,
// where the helpers live, is out of scope.
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

function isCallee(node) {
  const { parent } = node;
  return (parent.type === "CallExpression" || parent.type === "NewExpression") && parent.callee === node;
}

// Function members that run the function: parseInt.call(null, s) is parseInt(s).
const INVOKERS = new Set(["call", "apply", "bind"]);

// A function read as a value: not called (reported as numberCall or
// parseCall), not the object of Number.x unless x runs it (Number.call),
// not a property name (x.Number, { Number: 1 }) and not a type.
function isValue(node) {
  if (isCallee(node)) return false;
  const { parent } = node;
  if (parent.type === "MemberExpression") {
    if (parent.object === node) return !parent.computed && parent.property.type === "Identifier" && INVOKERS.has(parent.property.name);
    return parent.computed;
  }
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
      parserValue:
        "parseInt/parseFloat passed as a function, as in .map(parseInt), parse each item loosely ('12abc' is 12; .map(parseInt) also takes the index as the radix). Map with parseId, parseInteger or parseAmount from src/utils/parse.ts.",
      unaryPlus:
        "Unary + is Number() ('' is 0, '1e3' is 1000). Parse a string with parseId, parseInteger or parseAmount from src/utils/parse.ts; if it is already a number, drop the +.",
    },
    schema: [],
  },
  create(context) {
    const call = (node) => {
      if (node.callee.type === "Identifier" && node.callee.name === "Number") {
        context.report({ node, messageId: "numberCall" });
      } else if (isParser(node.callee)) {
        context.report({ node, messageId: "parseCall" });
      }
    };
    return {
      CallExpression: call,
      NewExpression: call,
      Identifier(node) {
        if (!isValue(node)) return;
        if (node.name === "Number") context.report({ node, messageId: "numberValue" });
        else if (PARSERS.has(node.name)) context.report({ node, messageId: "parserValue" });
      },
      MemberExpression(node) {
        // Number.parseInt as a value; the bare parseInt is the Identifier case.
        if (isParser(node) && !isCallee(node)) context.report({ node, messageId: "parserValue" });
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
