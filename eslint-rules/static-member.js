// The one static-name resolver of the local rules (#320). A guard that reads
// only `a.b` lets `a["b"]` through, so every rule asks this helper.

/** The static name of a member or key: `a.name`, `a["name"]`, `` a[`name`] ``, `{ name }`; a computed variable has none. */
export const keyName = (key, computed) => {
  if (!key) return undefined;
  if (key.type === "Literal") return String(key.value);
  if (key.type === "TemplateLiteral" && key.expressions.length === 0) return key.quasis[0].value.cooked;
  return key.type === "Identifier" && !computed ? key.name : undefined;
};

/** The static name a MemberExpression reads, or undefined when its key is computed from a variable. */
export const memberName = (member) => keyName(member.property, member.computed);
