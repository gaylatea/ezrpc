import * as sodium from "libsodium-wrappers-sumo";

import { autoencode, autodecode } from "../src/format";

beforeAll(async function () {
    await sodium.ready;
});

describe("Wire Format Encoding", () => {
    it("should automatically encode Uint8Arrays", () => {
        const o = {
            key: sodium.crypto_secretbox_keygen(),
        };
        const e = autoencode(o);
        const d = autodecode(e);

        expect(d).toStrictEqual(o);
    });

    it("should encode/decode arbitrarily deep structures", () => {
        const o = {
            k: {
                e: {
                    y: sodium.crypto_secretbox_keygen(),
                }
            }
        };

        const e = autoencode(o);
        const d = autodecode(e);

        expect(d).toStrictEqual(o);
    });

    it("should encode/decode Arrays", () => {
        const o = {
            k: [sodium.crypto_secretbox_keygen(), sodium.crypto_secretbox_keygen(),],
        };
        const e = autoencode(o);
        const d = autodecode(e);

        expect(d).toStrictEqual(o);
    });

    it("should properly transmit null data over the wire", () => {
        const o = null;
        const e = autoencode(o);
        const d = autodecode(e);

        expect(d).toStrictEqual(null);
    });

    it("should properly transmit Dates", () => {
        const o = new Date();
        const e = autoencode(o);
        const d = autodecode(e);

        expect(d).toStrictEqual(o);
    });
});