import fetch from "cross-fetch";

import * as internal from "./types";

import { encrypt, decrypt } from "./payload";
import { autoencode, autodecode } from "./format";

/**
 * Serves as a base client for more complex workflows to build on top of.
 * 
 * RPCClient isn't really designed to be called directly by UI code, but is
 * better suited to be wrapped in an implementing class that does whatever
 * extra computation is needed on top of the data given by the server.
 */
export abstract class RPCClient {
  // These properties should be set by an implementer's login()/register()
  // functions. All of them must be set for encryptedCall() to work properly.
  protected userID: string;
  protected privateKey: Uint8Array;
  protected publicKey: Uint8Array;
  protected serverKey: Uint8Array;

  /**
   * Construct a new client that can call endpoints on the server.
   * 
   * @param baseURL - URL prefix to use when calling the server. By default
   * this is just a path prefix suitable for browsers. When calling with a
   * NodeJS or test client, this should be set to the address of the server
   * too.
   */
  constructor(private baseURL = "/rpc") { }

  /**
   * @returns whether the client is properly signed in and should be able to
   * interact with secure parts of the system.
   */
  public get isloggedIn(): boolean {
    return (
      this.userID !== undefined &&
      this.privateKey !== undefined &&
      this.publicKey !== undefined &&
      this.serverKey !== undefined
    );
  }

  /**
   * Destroy all information and keys used to encrypt data for the server.
   */
  public logout(): void {
    this.userID = undefined;
    this.privateKey = undefined;
    this.publicKey = undefined;
    this.serverKey = undefined;
  }

  /**
   * Make an unencrypted call and marshal the input/output data types properly.
   * 
   * @param decl - The endpoint to call.
   * 
   * @returns A function which accepts the endpoint's input type, and returns
   * a promise to the endpoint's output type.
   */
  protected call<I, O>(
    decl: internal.RPCFunction<I, O>
  ): (args: I) => Promise<O> {
    return async (args: I): Promise<O> => {
      return await this.rawCall(decl.name, args) as O;
    };
  }

  /**
   * Call an encrypted endpoint using the keys setup by some login/registration
   * method.
   * 
   * @param decl - The endpoint to call.
   * 
   * @returns A function which accepts the endpoint's input type, and returns
   * a promise to the endpoint's output type.
   */
  protected encryptedCall<I, O>(
    decl: internal.RPCFunction<I, O>
  ): (args: I) => Promise<O> {
    return async (args: I): Promise<O> => {
      if(!this.isloggedIn) {
        // TODO(silversupreme): Some sort of better error type here?
        return Promise.reject(new Error());
      }

      // Payloads can't be undefined, so we create a blank object and send it
      // across the wire. This still helps us do verification of data on the
      // wire.
      let a: unknown = args;
      if (a === undefined) {
        a = {};
      }
      const encryptedBody = encrypt(a, this.serverKey, this.privateKey);

      const resp = await this.rawCall(decl.name, {
        payload: encryptedBody,
        id: this.userID,
      }) as Uint8Array;
      return decrypt(resp, this.serverKey, this.privateKey) as O;
    };
  }

  /**
   * rawCall sets some common options for all requests to the RPC server.
   *
   * @param rpcName - Name to include in the HTTP request.
   * @param data    - Encoded data to send to the endpoint.
   * 
   * @returns The raw data from the server, or an error, which might need
   * further decryption.
   */
  private async rawCall(
    rpcName: string,
    data: unknown = {}
  ): Promise<unknown> {
    const options: RequestInit = {
      body: JSON.stringify(autoencode(data)),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      mode: "same-origin",
      cache: "no-cache",
      credentials: "same-origin",
      redirect: "follow",
      referrerPolicy: "no-referrer",
    };

    const r = await fetch(`${this.baseURL}/${rpcName}`, options);
    const rData = autodecode(await r.json());
    if (r.status !== 200) {
      // TODO(silversupreme): Propagate errors here.
      return Promise.reject(new Error(r.statusText));
    }

    return rData;
  }
}
