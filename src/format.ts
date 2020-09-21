import * as sodium from "libsodium-wrappers-sumo";

/**
 * Automatically encode arbitrarily-deep JS objects in a format that is suitable
 * for transmission over the wire as JSON.
 * 
 * @param o - The output data that needs to be encoded.
 * 
 * @returns Properly-formatted data for the wire.
 */
export function autoencode(o: unknown): unknown {
  if (o === null) {
    return null;
  }

  if (o instanceof Uint8Array) {
    return `hex$${sodium.to_hex(o)}`;
  }

  if (Array.isArray(o)) {
    const t: unknown[] = [];
    for (const p of o) {
      t.push(autoencode(p));
    }

    return t;
  }

  if (o instanceof Date) {
    return `date$${o.toISOString()}`;
  }

  if (typeof o === "object") {
    const t: unknown = {};
    for (const b in o) {
      t[b] = autoencode(o[b]);
    }

    return t;
  }

  return o;
}

/**
 * Automatically decode wire-formatted data into arbitrarily deep JS objects.
 * 
 * @param e - Encoded data to decode.
 * 
 * @returns Reconstructed JS object.
 */
export function autodecode(e: unknown): unknown {
  if (e === null) {
    return null;
  }

  if (typeof e === "string") {
    if (e.startsWith("hex$")) {
      return sodium.from_hex(e.replace("hex$", ""));
    }

    if (e.startsWith("date$")) {
      return new Date(e.replace("date$", ""));
    }
  }

  if (Array.isArray(e)) {
    const o: unknown[] = [];
    for (const k of e) {
      o.push(autodecode(k));
    }

    return o;
  }

  if (typeof e === "object") {
    const o: unknown = {};
    for (const k in e) {
      o[k] = autodecode(e[k]);
    }

    return o;
  }

  return e;
}
