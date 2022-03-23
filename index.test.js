import { expandSchemaTag } from "./index.js";

test("expanding schema tags", async () => {
  const sdl = `#graphql
    extend schema @tag(name: "mytag")

    directive @tag(name: String!) on SCHEMA | OBJECT | FIELD_DEFINITION | INTERFACE | UNION

    type Query {
      a: A
    }

    type Mutation {
      c: C
    }

    type Subscription {
      d: D
    }

    type A implements C @tag(name: "other") {
      b: String
    }

    interface C {
      b: String
    }

    union D = A
  `;

  const actual = expandSchemaTag(sdl);

  expect(actual).toMatchInlineSnapshot(`
"directive @tag(name: String!) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION

type Query {
  a: A @tag(name: \\"mytag\\")
}

type Mutation {
  c: C @tag(name: \\"mytag\\")
}

type Subscription {
  d: D @tag(name: \\"mytag\\")
}

type A implements C @tag(name: \\"other\\") @tag(name: \\"mytag\\") {
  b: String
}

interface C @tag(name: \\"mytag\\") {
  b: String
}

union D @tag(name: \\"mytag\\") = A"
`);
});
