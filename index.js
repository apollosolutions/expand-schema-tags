import { getDirective } from "@graphql-tools/utils";
import {
  BREAK,
  buildASTSchema,
  DirectiveLocation,
  GraphQLSchema,
  isEnumType,
  isInputObjectType,
  isInterfaceType,
  isObjectType,
  Kind,
  parse,
  print,
  visit,
} from "graphql";

/**
 * @param {string} name
 * @returns {import("graphql").DirectiveNode}
 */
function makeTag(name) {
  return {
    kind: Kind.DIRECTIVE,
    name: { kind: Kind.NAME, value: "tag" },
    arguments: [
      {
        kind: Kind.ARGUMENT,
        name: { kind: Kind.NAME, value: "name" },
        value: { kind: Kind.STRING, value: name },
      },
    ],
  };
}

/**
 * @param {import("graphql").DirectiveDefinitionNode} def
 * @returns {import("graphql").DirectiveDefinitionNode}
 */
function fixTagDirectiveDefinition(def) {
  return {
    ...def,
    locations: def.locations.filter(
      (l) => l.value !== DirectiveLocation.SCHEMA
    ),
  };
}

/**
 * @typedef {import("graphql").ObjectTypeDefinitionNode |
 * import("graphql").InterfaceTypeDefinitionNode |
 * import("graphql").UnionTypeDefinitionNode |
 * import("graphql").EnumTypeDefinitionNode |
 * import("graphql").InputObjectTypeDefinitionNode |
 * import("graphql").ScalarTypeDefinitionNode} TaggableNode
 */

/**
 * @param {GraphQLSchema} schema
 * @param {TaggableNode} node
 * @param {string[]} tags
 */
function addTags(schema, node, tags) {
  const name = node.name.value;
  const type = schema.getType(name);
  if (!type) return node;

  const existingTags =
    getDirective(schema, type, "tag")?.map((dir) => dir.name) ?? [];
  const tagsToAdd = tags.filter((tag) => !existingTags.includes(tag));

  if (tagsToAdd.length) {
    return {
      ...node,
      directives: [
        ...(node.directives ?? []),
        ...tagsToAdd.map((name) => makeTag(name)),
      ],
    };
  }

  return node;
}

/**
 * @param {GraphQLSchema} schema
 * @param {import("graphql").ObjectTypeDefinitionNode | import("graphql").InterfaceTypeDefinitionNode | import("graphql").InputObjectTypeDefinitionNode} node
 * @param {string[]} tags
 * @param {{ applyInheritance: boolean }} options
 */
function addTagsToFields(schema, node, tags, { applyInheritance }) {
  const name = node.name.value;
  const type = schema.getType(name);
  if (!type) return node;

  if (!isObjectType(type) && !isInterfaceType(type) && !isInputObjectType(type))
    return node;

  const typeDirectiveNames = applyInheritance
    ? getTagNames(type.astNode) ?? []
    : [];
  const allTagsToAdd = [...new Set([...tags, ...typeDirectiveNames])];
  const directives = applyInheritance
    ? node.directives?.filter((d) => d.name.value !== "tag")
    : node.directives;

  const fieldsWithTags = (node.fields ?? []).map((field) => {
    const fieldDef = type.getFields()[field.name.value];

    // can't use getDirective here because external may not be defined in the schema
    const isExternal = getDirectiveNames(fieldDef.astNode).includes("external");
    if (isExternal) {
      return field;
    }

    const existingTags =
      getDirective(schema, fieldDef, "tag")?.map((dir) => dir.name) ?? [];
    const tagsToAdd = allTagsToAdd.filter((tag) => !existingTags.includes(tag));

    return {
      ...field,
      directives: [
        ...(field.directives ?? []),
        ...tagsToAdd.map((name) => makeTag(name)),
      ],
    };
  });

  return {
    ...node,
    directives,
    fields: fieldsWithTags,
  };
}

/**
 * @param {GraphQLSchema} schema
 * @param {import("graphql").EnumTypeDefinitionNode} node
 * @param {string[]} tags
 * @param {{ applyInheritance: boolean }} options
 */
function addTagsToValues(schema, node, tags, { applyInheritance }) {
  const name = node.name.value;
  const type = schema.getType(name);
  if (!type) return node;

  if (!isEnumType(type)) return node;

  const typeDirectiveNames = applyInheritance
    ? getTagNames(type.astNode) ?? []
    : [];
  const allTagsToAdd = [...new Set([...tags, ...typeDirectiveNames])];
  const directives = applyInheritance
    ? node.directives?.filter((d) => d.name.value !== "tag")
    : node.directives;

  const valuesWithTags = (node.values ?? []).map((value) => {
    const valueDef = type.getValue(value.name.value);

    if (!valueDef) return value;

    const existingTags =
      getDirective(schema, valueDef, "tag")?.map((dir) => dir.name) ?? [];
    const tagsToAdd = allTagsToAdd.filter((tag) => !existingTags.includes(tag));

    return {
      ...value,
      directives: [
        ...(value.directives ?? []),
        ...tagsToAdd.map((name) => makeTag(name)),
      ],
    };
  });

  return {
    ...node,
    directives,
    values: valuesWithTags,
  };
}

/**
 * @param {import("graphql").DocumentNode} document
 */
function isFederation2(document) {
  let isFed2 = false;
  visit(document, {
    enter(node) {
      if (
        node.kind === Kind.SCHEMA_DEFINITION ||
        node.kind === Kind.SCHEMA_EXTENSION
      ) {
        const links = node.directives?.filter((d) => d.name.value === "link");
        isFed2 =
          links?.some((d) =>
            d.arguments?.some(
              (a) =>
                a.name.value === "url" &&
                a.value.kind === Kind.STRING &&
                a.value.value.startsWith(
                  "https://specs.apollo.dev/federation/v2"
                )
            )
          ) ?? false;
        if (isFed2) {
          return BREAK;
        }
      }
    },
  });
  return isFed2;
}

/**
 * @param {import("graphql").DocumentNode} document
 * @returns {[import("graphql").DocumentNode, string[]]}
 */
function extractSchemaTags(document) {
  /** @type {Set<string>} */
  const tags = new Set();

  const newDocument = visit(document, {
    // remove @tag directives
    SchemaDefinition: {
      enter(node) {
        getTagNames(node).forEach((name) => tags.add(name));

        return {
          ...node,
          directives: [
            ...(node.directives?.filter((d) => d.name.value !== "tag") ?? []),
          ],
        };
      },
    },

    // remove @tag directives, and remove entirely if there are no other directives
    SchemaExtension: {
      enter(node) {
        getTagNames(node).forEach((name) => tags.add(name));

        const remainingDirectives =
          node.directives?.filter((d) => d.name.value !== "tag") ?? [];

        if (!remainingDirectives.length) {
          return null;
        }

        return {
          ...node,
          directives: remainingDirectives,
        };
      },
    },

    // swap with the canonical tag directive definition
    DirectiveDefinition: {
      enter(node) {
        if (node.name.value === "tag") {
          return fixTagDirectiveDefinition(node);
        }
      },
    },
  });

  return [newDocument, [...tags]];
}

/**
 * @param {string} sdl
 * @param {{ applyInheritance: boolean, isFed2?: boolean }} options
 */
export function expandSchemaTag(sdl, { applyInheritance, isFed2 }) {
  const document = parse(sdl);

  isFed2 = isFed2 ?? isFederation2(document);
  const [fixedDocument, tags] = extractSchemaTags(document);
  // const schema = buildSubgraphSchema(fixedDocument);
  const schema = buildASTSchema(fixedDocument, {
    assumeValid: true,
    assumeValidSDL: true,
  });

  const newDocument = visit(fixedDocument, {
    ObjectTypeDefinition: {
      enter(node) {
        return addTagsToFields(schema, node, tags, { applyInheritance });
      },
    },

    InterfaceTypeDefinition: {
      enter(node) {
        return addTagsToFields(schema, node, tags, { applyInheritance });
      },
    },

    UnionTypeDefinition: {
      enter(node) {
        return addTags(schema, node, tags);
      },
    },

    EnumTypeDefinition: {
      enter(node) {
        if (!isFed2) return;
        return addTagsToValues(schema, node, tags, { applyInheritance });
      },
    },

    InputObjectTypeDefinition: {
      enter(node) {
        if (!isFed2) return;
        return addTagsToFields(schema, node, tags, { applyInheritance });
      },
    },

    ScalarTypeDefinition: {
      enter(node) {
        if (!isFed2) return;
        return addTags(schema, node, tags);
      },
    },
  });

  return print(newDocument);
}

/**
 * A version of `getDirectives` that doesn't require a schema. The schema with
 * schema tags isn't valid yet, so we can build a schema to use with the
 * graphql-tools version.
 * @param {import("graphql").ASTNode | null | undefined} node
 */
function getDirectiveNames(node) {
  if (!node || !("directives" in node)) return [];
  return node.directives?.map((d) => d.name.value) ?? [];
}

/**
 * A version of `getDirectives` that doesn't require a schema. The schema with
 * schema tags isn't valid yet, so we can build a schema to use with the
 * graphql-tools version.
 * @param {import("graphql").ASTNode | null | undefined} node
 */
function getTagNames(node) {
  if (!node || !("directives" in node)) return [];

  const tagDirectives =
    node.directives?.filter((d) => d.name.value === "tag") ?? [];

  const nameArguments = tagDirectives
    .map((d) => d.arguments?.find((a) => a.name.value === "name"))
    .filter(
      /** @returns {a is import("graphql").ConstArgumentNode} */ (a) =>
        Boolean(a)
    );

  return nameArguments
    .map((a) => (a.value.kind === Kind.STRING ? a.value.value : null))
    .filter(/** @returns {a is string} */ (a) => Boolean(a));
}
