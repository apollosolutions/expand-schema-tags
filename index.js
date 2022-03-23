import { getDirective } from "@graphql-tools/utils";
import {
  DirectiveLocation,
  GraphQLSchema,
  GraphQLString,
  isObjectType,
  Kind,
  parse,
  print,
  visit,
} from "graphql";
import { buildSubgraphSchema } from "@apollo/subgraph";

/** @type {import("graphql").DirectiveDefinitionNode} */
const canonicalTagDefinition = {
  kind: Kind.DIRECTIVE_DEFINITION,
  name: { kind: Kind.NAME, value: "tag" },
  arguments: [
    {
      kind: Kind.INPUT_VALUE_DEFINITION,
      name: { kind: Kind.NAME, value: "name" },
      type: {
        kind: Kind.NON_NULL_TYPE,
        type: {
          kind: Kind.NAMED_TYPE,
          name: { kind: Kind.NAME, value: GraphQLString.name },
        },
      },
    },
  ],
  repeatable: true,
  locations: [
    { kind: Kind.NAME, value: DirectiveLocation.FIELD_DEFINITION },
    { kind: Kind.NAME, value: DirectiveLocation.INTERFACE },
    { kind: Kind.NAME, value: DirectiveLocation.OBJECT },
    { kind: Kind.NAME, value: DirectiveLocation.UNION },
  ],
};

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
 * @param {GraphQLSchema} schema
 * @param {import("graphql").ObjectTypeDefinitionNode | import("graphql").InterfaceTypeDefinitionNode | import("graphql").UnionTypeDefinitionNode} node
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
 * @param {import("graphql").ObjectTypeDefinitionNode} node
 * @param {string[]} tags
 */
function addTagsToFields(schema, node, tags) {
  const name = node.name.value;
  const type = schema.getType(name);
  if (!type) return node;

  if (!isObjectType(type)) return node;

  const fieldsWithTags = (node.fields ?? []).map((field) => {
    const fieldDef = type.getFields()[field.name.value];

    const existingTags =
      getDirective(schema, fieldDef, "tag")?.map((dir) => dir.name) ?? [];
    const tagsToAdd = tags.filter((tag) => !existingTags.includes(tag));

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
    fields: fieldsWithTags,
  };
}

/**
 * @param {string} sdl
 */
export function expandSchemaTag(sdl) {
  const document = parse(sdl);

  const schema = buildSubgraphSchema(document);
  const tags =
    getDirective(schema, schema, "tag")?.map((dir) => dir.name) ?? [];

  const newDocument = visit(document, {
    // remove @tag directives
    SchemaDefinition: {
      enter(node) {
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
        if (node.name.value === "tag") return canonicalTagDefinition;
      },
    },

    // if it's a root type, add the tags to all fields
    // if it's another type, add the tags
    ObjectTypeDefinition: {
      enter(node) {
        if (
          node.name.value === schema.getQueryType()?.name ||
          node.name.value === schema.getMutationType()?.name ||
          node.name.value === schema.getSubscriptionType()?.name
        ) {
          return addTagsToFields(schema, node, tags);
        } else {
          return addTags(schema, node, tags);
        }
      },
    },

    // add tags
    InterfaceTypeDefinition: {
      enter(node) {
        return addTags(schema, node, tags);
      },
    },

    // add tags
    UnionTypeDefinition: {
      enter(node) {
        return addTags(schema, node, tags);
      },
    },
  });

  return print(newDocument);
}
