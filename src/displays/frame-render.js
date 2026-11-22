import { deflateSync } from "node:zlib";

/** What the panel actually emits: RAM, inverted if set, nothing while off. Row-major 0/1. */
export const visiblePixels = (s) => {
  const out = new Uint8Array(s.width * s.height);
  if (!s.on) return out;
  for (let i = 0; i < out.length; i++) out[i] = s.pixels[i] ^ (s.inverted ? 1 : 0);
  return out;
};

/** One terminal line per two pixel rows, using ▀ ▄ █ and space: exact, no colours needed. */
export const toHalfBlocks = (s) => {
  const px = visiblePixels(s);
  const lines = [];
  for (let y = 0; y < s.height; y += 2) {
    let line = "";
    for (let x = 0; x < s.width; x++) {
      const top = px[y * s.width + x];
      const bottom = y + 1 < s.height ? px[(y + 1) * s.width + x] : 0;
      line += top && bottom ? "█" : top ? "▀" : bottom ? "▄" : " ";
    }
    lines.push(line);
  }
  return lines;
};

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

/** 8-bit greyscale PNG of the visible frame, each pixel a `scale`×`scale` block. */
export const toPng = (s, { scale = 1 } = {}) => {
  const px = visiblePixels(s);
  const w = s.width * scale;
  const h = s.height * scale;
  const raw = Buffer.alloc(h * (w + 1));
  for (let y = 0; y < h; y++) {
    const rowStart = y * (w + 1); // byte 0 = filter type 0
    const sy = Math.floor(y / scale);
    for (let x = 0; x < w; x++) raw[rowStart + 1 + x] = px[sy * s.width + Math.floor(x / scale)] ? 255 : 0;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};
