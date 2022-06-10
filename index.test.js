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
      b: String @tag(name: "another")
      external: String @external
    }

    interface C {
      b: String
    }

    union D = A

    enum Enum {
      X
      Y
    }

    input I {
      f: String
    }
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

type A implements C @tag(name: \\"other\\") {
  b: String @tag(name: \\"another\\") @tag(name: \\"mytag\\")
  external: String @external
}

interface C {
  b: String @tag(name: \\"mytag\\")
}

union D @tag(name: \\"mytag\\") = A

enum Enum {
  X
  Y
}

input I {
  f: String
}"
`);
});

test("fed2: expanding schema tags", async () => {
  const sdl = `#graphql
    extend schema
      @link(url: "https://specs.apollo.dev/federation/v2.0"
            import: ["@tag" "@external" "@provides"])
      @tag(name: "mytag")

    type Query {
      a: A @provides(fields: "external")
    }

    type Mutation {
      c: C
    }

    type Subscription {
      d: D
    }

    type A implements C @tag(name: "other") {
      b: String @tag(name: "another")
      external: String @external
    }

    interface C {
      b: String
    }

    union D = A

    enum Enum {
      X
      Y
    }

    input I {
      f: String
    }

    scalar JSON
  `;

  const actual = expandSchemaTag(sdl);

  expect(actual).toMatchInlineSnapshot(`
"extend schema @link(url: \\"https://specs.apollo.dev/federation/v2.0\\", import: [\\"@tag\\", \\"@external\\", \\"@provides\\"])

type Query {
  a: A @provides(fields: \\"external\\") @tag(name: \\"mytag\\")
}

type Mutation {
  c: C @tag(name: \\"mytag\\")
}

type Subscription {
  d: D @tag(name: \\"mytag\\")
}

type A implements C @tag(name: \\"other\\") {
  b: String @tag(name: \\"another\\") @tag(name: \\"mytag\\")
  external: String @external
}

interface C {
  b: String @tag(name: \\"mytag\\")
}

union D @tag(name: \\"mytag\\") = A

enum Enum {
  X @tag(name: \\"mytag\\")
  Y @tag(name: \\"mytag\\")
}

input I {
  f: String @tag(name: \\"mytag\\")
}

scalar JSON @tag(name: \\"mytag\\")"
`);
});
