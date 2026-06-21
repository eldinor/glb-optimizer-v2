import assert from "node:assert/strict";
import { encodeToKTX2 } from "babylonpress-ktx2-encoder";
import { ktx2 } from "babylonpress-ktx2-encoder/gltf-transform";

const rgba = new Uint8Array([
  255, 0, 0, 255,
  0, 255, 0, 255,
  0, 0, 255, 255,
  255, 255, 255, 255
]);

const result = await encodeToKTX2(new Uint8Array([0]), {
  isUASTC: true,
  imageDecoder: async () => ({ width: 2, height: 2, data: rgba })
});

const ktx2Identifier = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];

assert.deepEqual(Array.from(result.subarray(0, ktx2Identifier.length)), ktx2Identifier);
assert.equal(typeof ktx2, "function");

console.log(`Package smoke test passed (${result.byteLength} output bytes).`);
