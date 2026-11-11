// Draws the app icon: the cherub (hover_light_0, scaled 6x with no smoothing) over a
// pixel cloud in a Cloud Nine sky, on the macOS icon shape (824 px rounded square on a
// 1024 canvas, with a soft shadow). Writes build/icon.png (1024) and build/icon.icns.
// Deterministic. The icon contains the cherub's art, so like the art it stays out of
// git; run this to remake it (docs/RELEASE.md).
// Usage: node scripts/icon.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { readPng } from "../test/helpers/png.ts";

const ROOT = path.join(import.meta.dirname, "..");
const OUT = path.join(ROOT, "build");
const S = 1024;
const BODY = { x: 100, y: 100, size: 824, radius: 185 };
const PX = 6; // screen px per art px, for the cherub and the cloud alike
const SPRITE = "hover_light/hover_light_0.png";

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const C = {
  skyTop: hex("#9cc8f2"),
  skyBottom: hex("#fde6d2"),
  cloud: hex("#ffffff"),
  cloudShade: hex("#dfe9f6"),
  cloudEdge: hex("#bccde6"),
};

const img = new Float32Array(S * S * 4); // straight RGBA, 0..1 alpha

function over(x, y, [r, g, b], a) {
  if (a <= 0 || x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  const da = img[i + 3];
  const oa = a + da * (1 - a);
  for (let c = 0; c < 3; c++) img[i + c] = ([r, g, b][c] * a + img[i + c] * da * (1 - a)) / oa;
  img[i + 3] = oa;
}

// Signed distance to the rounded square (negative inside).
function sd(x, y) {
  const h = BODY.size / 2;
  const cx = BODY.x + h;
  const cy = BODY.y + h;
  const qx = Math.abs(x - cx) - (h - BODY.radius);
  const qy = Math.abs(y - cy) - (h - BODY.radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - BODY.radius;
}

// Soft shadow under the shape (offset down), then the shape's sky with an antialiased edge.
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const d = sd(x, y - 12);
    if (d < 28) over(x, y, [20, 30, 60], 0.32 * Math.min(1, Math.max(0, (28 - d) / 40)) ** 2);
  }
}
const inside = (x, y) => {
  let n = 0;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (sd(x + (i + 0.5) / 4, y + (j + 0.5) / 4) < 0) n++;
  return n / 16;
};
const cover = new Float32Array(S * S);
for (let y = 0; y < S; y++) {
  const t = Math.min(1, Math.max(0, (y - BODY.y) / BODY.size));
  const sky = C.skyTop.map((v, c) => Math.round(v + (C.skyBottom[c] - v) * t));
  for (let x = 0; x < S; x++) {
    const a = inside(x, y);
    cover[y * S + x] = a;
    over(x, y, sky, a);
  }
}

// A pixel cloud on the 6 px grid: puffs as circles, snapped to whole cells, with a
// shaded underside and an outline. Cells outside the shape are clipped by its edge.
function cloud(cells) {
  const at = (cx, cy) => cells.some(([px, py, r]) => (cx - px) ** 2 + (cy - py) ** 2 <= r * r);
  const minX = Math.min(...cells.map(([px, , r]) => px - r)) - 1;
  const maxX = Math.max(...cells.map(([px, , r]) => px + r)) + 1;
  const minY = Math.min(...cells.map(([, py, r]) => py - r)) - 1;
  const maxY = Math.max(...cells.map(([, py, r]) => py + r)) + 1;
  for (let cy = minY; cy <= maxY; cy++) {
    for (let cx = minX; cx <= maxX; cx++) {
      let color = null;
      if (at(cx, cy)) color = at(cx, cy + 2) ? C.cloud : C.cloudShade;
      else if (at(cx + 1, cy) || at(cx - 1, cy) || at(cx, cy + 1) || at(cx, cy - 1)) color = C.cloudEdge;
      if (!color) continue;
      for (let y = cy * PX; y < (cy + 1) * PX; y++) for (let x = cx * PX; x < (cx + 1) * PX; x++) over(x, y, color, cover[y * S + x]);
    }
  }
}
// Cell coordinates (6 px each; the canvas is 170 cells wide). The big cloud he floats
// over, and a small one top left.
cloud([[64, 129, 13], [83, 123, 17], [102, 128, 14], [118, 134, 9], [48, 136, 8], [85, 136, 13]]);
cloud([[30, 34, 4], [37, 31, 6], [45, 35, 4]]);

// The cherub, nearest neighbor, centered on his opaque area.
const sprite = readPng(path.join(ROOT, "assets", "cherub", SPRITE));
let [x0, y0, x1, y1] = [Infinity, Infinity, -1, -1];
for (let y = 0; y < sprite.height; y++) {
  for (let x = 0; x < sprite.width; x++) {
    if (sprite.data[(y * sprite.width + x) * 4 + 3] === 0) continue;
    [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  }
}
const left = Math.round((S - (x1 - x0 + 1) * PX) / 2 / PX) * PX - x0 * PX;
const top = 168 - y0 * PX;
for (let y = 0; y < sprite.height; y++) {
  for (let x = 0; x < sprite.width; x++) {
    const i = (y * sprite.width + x) * 4;
    const a = sprite.data[i + 3] / 255;
    if (a === 0) continue;
    for (let dy = 0; dy < PX; dy++) for (let dx = 0; dx < PX; dx++) over(left + x * PX + dx, top + y * PX + dy, [sprite.data[i], sprite.data[i + 1], sprite.data[i + 2]], a);
  }
}

function encode(file, w, h, rgba) {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  const crc = (b) => {
    let x = 0xffffffff;
    for (const v of b) x = table[(x ^ v) & 255] ^ (x >>> 8);
    return (x ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, d) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(type), d]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ih = Buffer.alloc(13);
  ih.writeUInt32BE(w, 0);
  ih.writeUInt32BE(h, 4);
  ih[8] = 8;
  ih[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ih), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}

const bytes = new Uint8Array(S * S * 4);
for (let i = 0; i < S * S; i++) {
  for (let c = 0; c < 3; c++) bytes[i * 4 + c] = Math.round(img[i * 4 + c]);
  bytes[i * 4 + 3] = Math.round(img[i * 4 + 3] * 255);
}
fs.mkdirSync(OUT, { recursive: true });
const png = path.join(OUT, "icon.png");
encode(png, S, S, bytes);

// icon.icns via the system's sips and iconutil (smooth downscaling suits the small sizes).
const set = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "icon-")), "icon.iconset");
fs.mkdirSync(set);
for (const size of [16, 32, 128, 256, 512]) {
  for (const [scale, suffix] of [[1, ""], [2, "@2x"]]) {
    const out = path.join(set, `icon_${size}x${size}${suffix}.png`);
    execFileSync("sips", ["-z", String(size * scale), String(size * scale), png, "--out", out], { stdio: "ignore" });
  }
}
execFileSync("iconutil", ["-c", "icns", set, "-o", path.join(OUT, "icon.icns")]);
fs.rmSync(path.dirname(set), { recursive: true, force: true });
console.log("wrote build/icon.png and build/icon.icns");
