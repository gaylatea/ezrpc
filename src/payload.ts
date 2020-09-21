import * as sodium from "libsodium-wrappers-sumo";
import { autoencode, autodecode } from "./format";

/**
 * Encrypts data to a receipient key.
 *
 * @param input        - Raw object to encode.
 * @param recipientKey - Public key of recipient, to encrypt to.
 * @param secretKey    - Secret key of sender.
 *
 * @returns            Encrypted buffer to send to recipient.
 */
export function encrypt(
  input: unknown,
  recipientKey: Uint8Array,
  secretKey: Uint8Array
): Uint8Array {
  const o = autoencode(input);
  const plaintext = JSON.stringify(o);
  const outputNonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const outputCipher = sodium.crypto_box_easy(
    plaintext,
    outputNonce,
    recipientKey,
    secretKey
  );

  const combined = new Uint8Array(outputNonce.length + outputCipher.length);
  combined.set(outputNonce, 0);
  combined.set(outputCipher, outputNonce.length);

  return combined;
}

/**
 * Decrypts a payload from a sender.
 *
 * @param payload   - Encrypted msgpack data from the wire.
 * @param senderKey - Public key of the sender; will be used to verify.
 * @param secretKey - Secret key of recipient.
 *
 * @returns         Original object encrypted by the sender.
 */
export function decrypt(
  payload: Uint8Array,
  senderKey: Uint8Array,
  secretKey: Uint8Array
): unknown {
  const nonce = payload.slice(0, sodium.crypto_box_NONCEBYTES);
  const ciphertext = payload.slice(
    sodium.crypto_box_NONCEBYTES,
    payload.length
  );

  // TODO: error handling here!
  const message = sodium.crypto_box_open_easy(
    ciphertext,
    nonce,
    senderKey,
    secretKey
  );

  const e = JSON.parse(Buffer.from(message).toString());
  const o = autodecode(e);
  return o;
}
