import * as t from "io-ts";

/**
 * Helper type for transmitting Uint8Array information over the wire.
 */
export const WireBytes = new t.Type<Uint8Array>(
  "WireBytes",
  (input: unknown): input is Uint8Array => {
    return input instanceof Uint8Array;
  },
  (input, context) =>
    input instanceof Uint8Array ? t.success(input) : t.failure(input, context),
  t.identity
);

/**
 * Helper type for transmitting Date information over the wire.
 */
export const WireDate = new t.Type<Date>(
  "WireDate",
  (input: unknown): input is Date => {
    return input instanceof Date;
  },
  (input: Date, context) =>
    input instanceof Date ? t.success(input) : t.failure(input, context),
  t.identity
);

/**
 * Basic type definition for an RPC endpoint.
 */
export interface RPCFunction<I, O> {
  (): {
    i: t.Type<I>;
    o: t.Type<O>;
  };
}

/**
 * Materializes the correct return type for an RPC handler.
 */
export type RPCReturn<T extends RPCFunction<unknown, unknown>> = t.TypeOf<
  ReturnType<T>["o"]
>;

/**
 * The minimal set of information a user profile type needs to have for the
 * server to encrypt authenticated requests for them.
 */
export interface RPCUser {
  id: string;
  publicKey: Uint8Array;
}

/**
 * Data that will actually appear on the wire for encrypted requests/responses.
 */
export interface RPCPayload {
  id: string;
  payload: Uint8Array;
}
