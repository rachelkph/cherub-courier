// Minimal PNG decoder for tests: 8-bit RGBA or RGB, non-interlaced. No deps.

import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

export type Image = { width: number; height: number; data: Uint8Array }; // RGBA

export function readPng(path: string): Image {
  const buf = readFileSync(path);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${path}: not a PNG`);
  let off = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const depth = body[8];
      colorType = body[9];
      if (depth !== 8 || (colorType !== 6 && colorType !== 2) || body[12] !== 0) {
        throw new Error(`${path}: unsupported PNG (depth ${depth}, color ${colorType}, interlace ${body[12]})`);
      }
    } else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const px = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += Math.floor((a + b) / 2);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + x] = v & 0xff;
    }
  }
  if (bpp === 4) return { width, height, data: px };
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data.set(px.subarray(i * 3, i * 3 + 3), i * 4);
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

export function blank(width: number, height: number): Image {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

// Source-over composite of src onto dst at (dx, dy), optionally mirrored.
export function draw(dst: Image, src: Image, dx: number, dy: number, flip = false): void {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const tx = dx + x;
      const ty = dy + y;
      if (tx < 0 || ty < 0 || tx >= dst.width || ty >= dst.height) continue;
      const sx = flip ? src.width - 1 - x : x;
      const s = (y * src.width + sx) * 4;
      const d = (ty * dst.width + tx) * 4;
      const sa = src.data[s + 3] / 255;
      const da = dst.data[d + 3] / 255;
      const oa = sa + da * (1 - sa);
      for (let k = 0; k < 3; k++) {
        dst.data[d + k] = oa === 0 ? 0 : Math.round((src.data[s + k] * sa + dst.data[d + k] * da * (1 - sa)) / oa);
      }
      dst.data[d + 3] = Math.round(oa * 255);
    }
  }
}

// Count of pixels whose RGBA differs by more than tol in any channel.
export function diffPixels(a: Image, b: Image, tol = 1): number {
  if (a.width !== b.width || a.height !== b.height) return Number.POSITIVE_INFINITY;
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    // Fully transparent pixels match regardless of their color channels.
    if (a.data[i + 3] === 0 && b.data[i + 3] === 0) continue;
    for (let k = 0; k < 4; k++) {
      if (Math.abs(a.data[i + k] - b.data[i + k]) > tol) {
        n++;
        break;
      }
    }
  }
  return n;
}
