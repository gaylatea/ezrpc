/* eslint-disable */

import * as t from "io-ts";
import * as sodium from "libsodium-wrappers-sumo";

import { RPCClient } from "../src/client";
import { RPCServer } from "../src/server";

const v1 = {
  Test: () => ({
    i: t.void,
    o: t.boolean,
  }),

  TestEncrypted: () => ({
    i: t.void,
    o: t.boolean,
  }),

  TestFails: () => ({
    i: t.void,
    o: t.void,
  }),
};

class User {
  id: string;
  publicKey: Uint8Array;
  envelope: Uint8Array;
}

class TestServer extends RPCServer<User> {
  constructor(
    private user: User,
    privateKey: Uint8Array,
    publicKey: Uint8Array
  ) {
    super(privateKey, publicKey);

    this.handle(v1.Test)(async () => {
      return true;
    });

    this.encryptedHandle(v1.TestEncrypted)(async () => {
      return true;
    });

    this.handle(v1.TestFails)(async () => {
      throw new Error("oh no");
    });
  }

  protected async getUser(_id: string): Promise<User> {
    return this.user;
  }
}

class TestClient extends RPCClient {
  constructor(baseURL = "") {
    super(baseURL);
  }

  public setKeys(userID: string, publicKey: Uint8Array, privateKey: Uint8Array, serverKey: Uint8Array) {
    this.userID = userID;
    this.publicKey = publicKey;
    this.privateKey = privateKey;
    this.serverKey = serverKey;
  }

  public async test() {
    return this.call(v1.Test)();
  }

  public async encrypted() {
    return this.encryptedCall(v1.TestEncrypted)();
  }

  public async testFails() {
    return this.call(v1.TestFails)();
  }
}

beforeAll(async () => {
  await sodium.ready;
});

describe("A complete RPC setup", () => {
  test("should support basic unencrypted calls", async () => {
    const userKeys = sodium.crypto_box_keypair();
    const serverKeys = sodium.crypto_box_keypair();

    const server = new TestServer(
      {
        id: "test",
        publicKey: userKeys.publicKey,
        envelope: sodium.randombytes_buf(16),
      },
      serverKeys.privateKey,
      serverKeys.publicKey
    );

    const [port, close] = await server.listen();

    const client = new TestClient(`http://localhost:${port}/rpc`);
    const called = await client.test();
    expect(called).toBe(true);

    await close();
  });

  test("should support encrypted calls with proper user keys", async () => {
    await sodium.ready;

    const userKeys = sodium.crypto_box_keypair();
    const serverKeys = sodium.crypto_box_keypair();

    const server = new TestServer(
      {
        id: "test",
        publicKey: userKeys.publicKey,
        envelope: sodium.randombytes_buf(16),
      },
      serverKeys.privateKey,
      serverKeys.publicKey
    );

    const [port, close] = await server.listen();

    const client = new TestClient(`http://localhost:${port}/rpc`);
    client.setKeys("test", userKeys.publicKey, userKeys.privateKey, serverKeys.publicKey);
    const called = await client.encrypted();
    expect(called).toBe(true);

    await close();
  });

  test("should not make encrypted calls without proper user keys", async () => {
    await sodium.ready;

    const userKeys = sodium.crypto_box_keypair();
    const serverKeys = sodium.crypto_box_keypair();

    const server = new TestServer(
      {
        id: "test",
        publicKey: userKeys.publicKey,
        envelope: sodium.randombytes_buf(16),
      },
      serverKeys.privateKey,
      serverKeys.publicKey
    );

    const [port, close] = await server.listen();

    const client = new TestClient(`http://localhost:${port}/rpc`);
    client.setKeys("test", userKeys.publicKey, userKeys.privateKey, serverKeys.publicKey);
    const called = await client.encrypted();
    expect(called).toBe(true);

    client.logout();
    await expect(client.encrypted()).rejects.toThrow();

    await close();
  });

  test("should properly report errors from the server", async () => {
    const userKeys = sodium.crypto_box_keypair();
    const serverKeys = sodium.crypto_box_keypair();

    const server = new TestServer(
      {
        id: "test",
        publicKey: userKeys.publicKey,
        envelope: sodium.randombytes_buf(16),
      },
      serverKeys.privateKey,
      serverKeys.publicKey
    );

    const [port, close] = await server.listen();

    const client = new TestClient(`http://localhost:${port}/rpc`);
    await expect(client.testFails()).rejects.toThrow();

    await close();
  });
});