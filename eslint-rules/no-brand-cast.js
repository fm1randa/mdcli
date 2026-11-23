import ts from "typescript";

// The entry and occurrence ID brands (#183, #193) only mean something when a
// check made the value: a loose `as EntryId` let any number or string through
// the typecheck as an entry ID (#277). The constructors in
// src/lib/entry-id-brands.ts are the one place that brands.
const BRANDS = new Set(["EntryId", "EntryIdText", "OccurrenceId"]);
const OWNER = "src/lib/entry-id-brands.ts";
// The unique symbol behind each brand, declared in src/types/entry.ts.
const BRAND_KEYS = { entryIdBrand: "EntryId", entryIdTextBrand: "EntryIdText", occurrenceIdBrand: "OccurrenceId" };
const BRAND_FILE = "/src/types/entry.ts";
const BRAND_PROPERTY = /^__@(\w+)@\d+$/;
// Property and type-argument steps (a union or intersection member is not one):
// deep enough for an ID inside an array inside an object.
const MAX_DEPTH = 4;

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

function brandOfProperty(symbol) {
  const brand = BRAND_KEYS[BRAND_PROPERTY.exec(symbol.escapedName)?.[1]];
  if (brand === undefined) return undefined;
  const declared = symbol.declarations?.some((d) => d.getSourceFile().fileName.endsWith(BRAND_FILE));
  return declared ? brand : undefined;
}

// The brands a resolved type carries: on itself, in a union or intersection
// member, a type argument (arrays, generics) or a property.
function typeBrands(checker, type, depth = 0, seen = new Set(), found = new Set()) {
  if (depth > MAX_DEPTH || seen.has(type)) return found;
  seen.add(type);
  const next = (t) => typeBrands(checker, t, depth + 1, seen, found);
  if (type.isUnionOrIntersection()) type.types.forEach((t) => typeBrands(checker, t, depth, seen, found));
  if (type.flags & ts.TypeFlags.Object) {
    if (type.objectFlags & ts.ObjectFlags.Reference) checker.getTypeArguments(type).forEach(next);
    for (const property of type.getProperties()) {
      const brand = brandOfProperty(property);
      if (brand !== undefined) found.add(brand);
      else next(checker.getTypeOfSymbol(property));
    }
  }
  return found;
}

// The brand a cast adds: one its resolved target carries and its operand does
// not, however the target is spelled (#290).
function addedBrand(node, checker, services) {
  if (node.type === "TSTypePredicate") return undefined;
  const target = typeBrands(checker, services.getTypeAtLocation(node));
  if (target.size === 0) return undefined;
  const source = typeBrands(checker, services.getTypeAtLocation(node.expression));
  return [...target].find((brand) => !source.has(brand));
}

export default {
  meta: {
    type: "problem",
    docs: { description: "Brand entry and occurrence IDs only through their constructors" },
    messages: {
      brandCast:
        "Casting to {{brand}} skips the check that makes a value one. Build it with asEntryId, asEntryIdText, asOccurrenceId or answeredOccurrenceId from " +
        OWNER +
        " (this covers `as {{brand}}`, `<{{brand}}>x`, the brand inside a union, array or object type, a renamed import, a type alias or interface of this file that carries it, an `x is {{brand}}` predicate, and any cast whose resolved type adds the brand, such as `as typeof id` or a type from another file).",
    },
    schema: [],
  },
  create(context) {
    const keys = context.sourceCode.visitorKeys;
    const aliases = new Map();
    const declarations = [];
    const casts = [];
    const collect = (node) => casts.push(node);
    return {
      ImportSpecifier(node) {
        const imported = node.imported.type === "Identifier" ? node.imported.name : node.imported.value;
        if (BRANDS.has(imported) && node.local.name !== imported) aliases.set(node.local.name, imported);
      },
      TSTypeAliasDeclaration: (node) => declarations.push([node.id.name, node.typeAnnotation]),
      TSInterfaceDeclaration: (node) => declarations.push([node.id.name, node.body]),
      TSAsExpression: collect,
      TSTypeAssertion: collect,
      TSTypePredicate: collect,
      "Program:exit"() {
        // A local type that carries a brand brands like the brand itself,
        // wherever it is declared; resolve aliases of aliases to a fixed point.
        let grew = true;
        while (grew) {
          grew = false;
          for (const [name, type] of declarations) {
            if (aliases.has(name)) continue;
            const brand = findBrand(type, aliases, keys);
            if (brand !== undefined) {
              aliases.set(name, brand);
              grew = true;
            }
          }
        }
        const services = context.sourceCode.parserServices;
        const checker = services?.program?.getTypeChecker();
        for (const node of casts) {
          const brand = findBrand(node.typeAnnotation, aliases, keys) ?? (checker && addedBrand(node, checker, services));
          if (brand !== undefined) context.report({ node, messageId: "brandCast", data: { brand } });
        }
      },
    };
  },
};
