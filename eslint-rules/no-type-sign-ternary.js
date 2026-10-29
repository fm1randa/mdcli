// The entry sign logic (tipo === 'r' ? +1 : -1) lived in three files before
// PR #138 consolidated it in src/commands/entries/type.ts (signForType).
// Any ternary comparing a type value to 'r' outside that module is the old
// scattered sign logic.
export default {
  meta: {
    type: "problem",
    docs: { description: "Ban tipo === 'r' / tipo !== 'r' sign logic outside src/commands/entries/type.ts" },
    messages: {
      signLogic: "Sign logic by type must use signForType() from src/commands/entries/type.ts, not a ternary on 'r'.",
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename || '';
    const isTypeModule = filename.includes('/entries/type.ts');
    if (isTypeModule) return {};

    function isRString(node) {
      return node && node.type === 'Literal' && node.value === 'r';
    }
    function isBinaryCompareToR(node) {
      if (node.type !== 'BinaryExpression') return false;
      if (!['===', '!==', '==', '!='].includes(node.operator)) return false;
      return (isRString(node.left) || isRString(node.right)) && ['===', '!==', '==', '!='].includes(node.operator);
    }
    return {
      ConditionalExpression(node) {
        if (isBinaryCompareToR(node.test)) {
          context.report({ node, messageId: "signLogic" });
        }
      },
    };
  },
};
