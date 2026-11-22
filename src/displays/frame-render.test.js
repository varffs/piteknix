import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { visiblePixels, toHalfBlocks, toPng } from "./frame-render.js";

const snap = (w, h, litXY, extra = {}) => {
  const pixels = new Uint8Array(w * h);
  for (const [x, y] of litXY) pixels[y * w + x] = 1;
  return { width: w, height: h, pixels, on: true, inverted: false, contrast: 0x8f, ...extra };
};

test("visible_applies_invert_and_off", () => {
  const s = snap(2, 2, [[0, 0]]);
  assert.deepEqual([...visiblePixels(s)], [1, 0, 0, 0]);
  assert.deepEqual([...visiblePixels({ ...s, inverted: true })], [0, 1, 1, 1]);
  assert.deepEqual([...visiblePixels({ ...s, on: false, inverted: true })], [0, 0, 0, 0]);
});

test("half_blocks_pack_two_rows_per_line", () => {
  // column 0: top only; column 1: bottom only; column 2: both; column 3: none
  const lines = toHalfBlocks(snap(4, 2, [[0, 0], [1, 1], [2, 0], [2, 1]]));
  assert.deepEqual(lines, ["▀▄█ "]);
  assert.equal(toHalfBlocks(snap(128, 64, [])).length, 32);
});

test("png_is_valid_and_scaled", () => {
  const png = toPng(snap(3, 2, [[1, 0]]), { scale: 2 });
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.toString("ascii", 12, 16), "IHDR");
  assert.equal(png.readUInt32BE(16), 6); // width 3 * 2
  assert.equal(png.readUInt32BE(20), 4); // height 2 * 2
  // IDAT: filter byte + 6 grey bytes per row
  const idatLen = png.readUInt32BE(33);
  assert.equal(png.toString("ascii", 37, 41), "IDAT");
  const raw = inflateSync(png.subarray(41, 41 + idatLen));
  assert.equal(raw.length, 4 * 7);
  assert.deepEqual([...raw.subarray(0, 7)], [0, 0, 0, 255, 255, 0, 0]);
});
