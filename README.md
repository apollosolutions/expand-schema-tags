# Expand Schema Tags script

**The code in this repository is experimental and has been provided for reference purposes only. Community feedback is welcome but this project may not be supported in the same way that repositories in the official [Apollo GraphQL GitHub organization](https://github.com/apollographql) are. If you need help you can file an issue on this repository, [contact Apollo](https://www.apollographql.com/contact-sales) to talk to an expert, or create a ticket directly in Apollo Studio.**

This script allows tagging all elements of a schema by adding a tag to the
schema definition itself.

```graphql
extend schema @tag(name: "put-this-everywhere")

type Query {
  foo: String
}

type Bar {
  id: ID!
}
```

```sh
cat myschema.graphql \
  | npx github:@apollosolutions/expand-schema-tags \
  | rover subgraph publish --name products --schema -
```

```graphql
type Query {
  foo: String @tag(name: "put-this-everywhere")
}

type Bar @tag(name: "put-this-everywhere") {
  id: ID!
}
```

## Notes

Inspired by our friends at Wayfair. ❤️
