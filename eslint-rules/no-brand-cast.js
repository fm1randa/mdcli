// The entry and occurrence ID brands (#183, #193) only mean something when a
// check made the value: a loose `as EntryId` let any number or string through
// the typecheck as an entry ID (#277). The constructors in
// src/lib/entry-id-brands.ts are the one place that brands.
const BRANDS = new Set(["EntryId", "EntryIdText", "OccurrenceId"]);
const OWNER = "src/lib/entry-id-brands.ts";

function brandName(typeName, aliases) {
  const name = typeName.type === "TSQualifiedName" ? typeName.right.name : typeName.name;
  if (BRANDS.has(name)) return name;
  return aliases.get(name);
}

function findBrand(node, aliases, keys) {
  if (node === null || typeof node !== "object") return undefined;
  if (node.type === "TSTypeReference") {
    const brand = brandName(node.typeName, aliases);
    if (brand !== undefined) return brand;
  }
  for (const key of keys[node.type] ?? []) {
    const child = node[key];
    for (const item of Array.isArray(child) ? child : [child]) {
      const brand = findBrand(item, aliases, keys);
      if (brand !== undefined) return brand;
    }
  }
  return undefined;
}

export default {
  meta: {
    type: "problem",
    docs: { description: "Brand entry and occurrence IDs only through their constructors" },
    messages: {
      brandCast:
        "Casting to {{brand}} skips the check that makes a value one. Build it with asEntryId, asEntryIdText, asOccurrenceId or answeredOccurrenceId from " +
        OWNER +
        " (this covers `as {{brand}}`, `<{{brand}}>x`, the brand inside a union, array or object type, a renamed import and an `x is {{brand}}` predicate).",
    },
    schema: [],
  },
  create(context) {
    const keys = context.sourceCode.visitorKeys;
    const aliases = new Map();
    const check = (node, type) => {
      const brand = findBrand(type, aliases, keys);
      if (brand !== undefined) context.report({ node, messageId: "brandCast", data: { brand } });
    };
    return {
      ImportSpecifier(node) {
        const imported = node.imported.type === "Identifier" ? node.imported.name : node.imported.value;
        if (BRANDS.has(imported) && node.local.name !== imported) aliases.set(node.local.name, imported);
      },
      TSAsExpression: (node) => check(node, node.typeAnnotation),
      TSTypeAssertion: (node) => check(node, node.typeAnnotation),
      TSTypePredicate: (node) => check(node, node.typeAnnotation),
    };
  },
};
