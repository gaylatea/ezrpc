# ezRPC
## The Problem
Existing RPC systems have a large barrier to entry for new systems. Once established, dealing with IDL files and their mapping between abstract and concrete types can be managed, but this can be overkill for simple systems that wish to take advantage of the major benefits of an RPC system:

* **Type-checking at both ends of a connection.** The RPC system can take this cognitive burden from the programmer, giving them input and output formats that they can rely on to make more robust systems.

* **Easier mocking of remote systems.** Since the RPC system serves as an abstract interface to the external system, creating stubbed versions for test purposes is made substantially easier.

## A Solution
ezRPC seeks to provide an easy-to-configure RPC system- with very opioninated defaults- that has these benefits too. It takes advantage of the isomorphic properties of full-Typescript environments to generate a single set of definitions of endpoints and their inputs/outputs.

### Endpoint Definitions
ezRPC uses `io-ts` to define its endpoints. Using the dark magic of template metaprogramming in Typescript, this allows types to be constructed that serve as validators of proper input/output formats. Example:

```typescript
import * as t from 'io-ts';

export const endpoints = {
  // An endpoint definition must follow this format, by defining and returning
  // an `i` type and an `o` type, Typescript is able to type check both calls
  // and server handlers to return and accept the same data.
  Test: () => ({
    i: t.void,
    o: t.boolean,
  }),

  // More complex structured types are available through `t.type`
  Complex: () => ({
    i: t.type({
      test: t.number,
      check: t.boolean,
    }),
    o: t.void,
  }),
};
```

### Compatibility
ezRPC clients are easily run in both NodeJS and web browser environments.

### Encryption
ezRPC can easily be configured to end-to-end encrypt requests and responses, if a `libsodium` keypair is generated for a given user. In environments where a TLS provider may be a potential point of attack for a system, this allows data to be more safely exchanged.