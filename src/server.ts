import * as express from "express";
import * as rateLimit from "express-rate-limit";

import * as internal from "./types";

import { autodecode, autoencode } from "./format";
import { encrypt, decrypt } from "./payload";
import { AddressInfo } from "net";

/**
 * Sharply limits unencrypted requests by default, to prevent malicious usage
 * of the server.
 */
const DEFAULT_UNENCRYPTED_RATE_LIMIT = rateLimit({
  windowMs: 1000 * 60,
  max: 120,
});

/**
 * Ease up on the restrictions for authorized requests.
 */
const DEFAULT_ENCRYPTED_RATE_LIMIT = rateLimit({
  windowMs: 1000 * 60,
  max: 6000,
});

/**
 * Provides a base server for applications to build their request handlers
 * on top of.
 * 
 * Login/registration methods are not provided; the implementing system must
 * create them for their specific use case.
 */
export abstract class RPCServer<A extends internal.RPCUser> {

  /**
   * Create a new server.
   * 
   * @param serverPrivateKey - A libsodium Box secret key used for encrypted
   * endpoints.
   * 
   * @param serverPublicKey  - A libsodium Box public key used for encrypted
   * endpoints.
   * 
   * @param rpcUrlPrefix     - URL prefix to use for endpoints.
   * 
   * @param app              - An existing Express app that this should be
   * integrated into.
   * 
   * @param handleLimiter    - A rate-limiter to use for
   * un-authenticated requests. A default one will be provided if none is
   * specified.
   * 
   * @param encryptedLimiter - A rate-limiter to use for authenticated
   * requests. A default one will be provided if none is specified.
   */
  constructor(
    protected serverPrivateKey: Uint8Array,
    protected serverPublicKey: Uint8Array,
    protected rpcUrlPrefix = "rpc",
    protected app: express.Express = null,
    private handleLimiter = DEFAULT_UNENCRYPTED_RATE_LIMIT,
    private encryptedLimiter = DEFAULT_ENCRYPTED_RATE_LIMIT,
  ) {
    // Allow an existing Express application to be passed in. If not, we set
    // some reasonable defaults for the application.
    if (app === null) {
      this.app = express();

      // This is required for proper rate-limiting behind proxies.
      this.app.set("trust proxy", 1);

      // No response from this server should ever be cached.
      this.app.use(function (_req, res, next) {
        res.header("Cache-Control", "no-store");
        res.header("Expires", "-1");
        res.header("Pragma", "no-cache");
        next();
      });
    }
  }

  /**
   * Install an unencrypted handler for the given endpoint definition.
   * 
   * @param decl - The `io-ts` endpoint definition to install.
   * 
   * @returns A function, which accepts a callback to be used when the given
   * RPC endpoint is called. This function accepts the endpoint's input type,
   * and returns its output type.
   */
  protected handle<I, O>(
    decl: internal.RPCFunction<I, O>,
  ): (fn: (input: I) => Promise<O>) => void {
    return (fn: (input: I) => Promise<O>) => {
      const url = `/${this.rpcUrlPrefix}/${decl.name}`;

      // We can't use Express' JSON parser since it expects input to always
      // be objects - our inputs might be raw typed data, such as a string.
      // JSON.parse handles that for us, as long as we give it the raw body
      // to use.
      this.app.post(
        url,
        this.handleLimiter,
        express.text({ type: "application/json" }),
        async (req, res) => {
          // TODO(silversupreme): input validation, my first pass needs some
          // work for void types.
          try {
            const decodedBody = autodecode(JSON.parse(req.body)) as I;

            const output = await fn(decodedBody);
            res.status(200).json(autoencode(output));
          } catch (error) {
            // Give a generic error if we choose not to give a specific issue.
            res.status(500).json(autoencode(error));
            return;
          }
        }
      );
    };
  }


  /**
   * Install an encrypted handler for the given endpoint function. Calling this
   * endpoint requires that keys on both ends are properly setup, and that the
   * given user ID can be looked up using `getUser`.
   * 
   * @param decl - The `io-ts` endpoint definition to install.
   * 
   * @returns A function, which accepts a callback to be used when the given
   * RPC endpoint is called. This function accepts the endpoint's input type,
   * and an instance of the user type specified in this server's template,
   * and returns its output type.
   */
  protected encryptedHandle<I, O>(
    decl: internal.RPCFunction<I, O>,
  ): (fn: (user: A, input: I) => Promise<O>) => void {
    return (fn: (user: A, input: I) => Promise<O>) => {
      const url = `/${this.rpcUrlPrefix}/${decl.name}`;

      // We can't use Express' JSON parser since it expects input to always
      // be objects - our inputs might be raw typed data, such as a string.
      // JSON.parse handles that for us, as long as we give it the raw body
      // to use.
      this.app.post(
        url,
        this.encryptedLimiter,
        express.text({ type: "application/json" }),
        async (req, res) => {
          // TODO(silversupreme): input validation, my first pass needs some
          // work for void types.

          try {
            const decodedBody = autodecode(
              JSON.parse(req.body)
            ) as internal.RPCPayload;

            let identity: A;
            let decryptedPayload: I;
            try {
              identity = await this.getUser(decodedBody.id);
              decryptedPayload = decrypt(
                decodedBody.payload,
                identity.publicKey,
                this.serverPrivateKey
              ) as I;
            } catch {
              res.status(401).json(autoencode({ message: "No such user found." }));
            }

            let output: unknown = await fn(identity, decryptedPayload);

            // Endpoints which return void need some special handling here.
            if (output === undefined) {
              output = {};
            }
            const encryptedOutput = encrypt(
              output,
              identity.publicKey,
              this.serverPrivateKey
            );
            res.status(200).json(autoencode(encryptedOutput));
          } catch (error) {
            // Give a generic error if we choose not to give a specific issue.
            res.status(500).json(autoencode(error));
            return;
          }
        }
      );
    };
  }

  /**
   * Start the server and listen to incoming requests.
   *
   * @param port - Port to listen on. The default is to listen on a random
   * port, which is returned to the caller for future client construction.
   *
   * @returns    A tuple of:
   * * port number used
   * * promise that can be called to stop the server
   */
  public async listen(port = 0): Promise<[number, () => Promise<void>]> {
    return new Promise((resolve, _reject) => {
      const server = this.app.listen(port, () => {
        resolve([
          (server.address() as AddressInfo).port,
          () => {
            return new Promise((resolve, reject) => {
              server.close((err) => {
                if (err === undefined) {
                  resolve();
                }

                reject(err);
              });
            });
          },
        ]);
      });
    });
  }

  protected abstract async getUser(id: string): Promise<A>;
}
