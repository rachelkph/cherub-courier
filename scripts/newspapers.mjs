// Builds the cherub's newspapers from one picture of a newspaper pile (Rachel's
// Perchance image, 2026-11-11), in his palette and outline:
// - assets/cherub/pile/pile_5.png: the whole picture, his feet on its top row (row 2);
//   pile_1..4: its bottom layers (one pile layer each is pile.layerHeight px);
// - pile/buried.png (BURIED_W x BURIED_H): the picture stretched in front of him, patched
//   wherever his body (frame row 60 down) would show through;
// - pile/unbury_1..4.png: climbing out, the picture shrinking from the mound's box to
//   pile_5's; the last is pile_5 where the engine draws the pile, so the switch is seamless;
// - fx/page_0..1.png: loose pages that burst off the mound (drawn, not from the picture).
// Sizes and offsets come from assets/cherub/manifest.json. The picture and the PNGs stay
// out of git like the rest of the art; this script is how to remake them. macOS only
// (uses sips to read and scale the picture). Deterministic.
// Usage: node scripts/newspapers.mjs [picture]   (default assets/cherub/source/newspaper-pile.jpeg)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { readPng } from "../test/helpers/png.ts";

const CHERUB = path.join(import.meta.dirname, "..", "assets", "cherub");
const SRC = process.argv[2] ?? path.join(CHERUB, "source", "newspaper-pile.jpeg");
const M = JSON.parse(fs.readFileSync(path.join(CHERUB, "manifest.json"), "utf8"));
const W = M.pile.width;
const LAYER = M.pile.layerHeight;
const PAD = M.pile.basePad;
const TOP = 2; // his feet rest on row 2 of a pile
const BURIED_W = 136;
const BURIED_H = 52; // up to just under his mouth
const SETTLE = 4;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
// The colours of the newspaper in his hand, coral last (twine only), and his outline.
const PAL = ["#fef8dd", "#d8d4c7", "#b0a9a7", "#475378", "#62485b", "#302f52", "#b2606b", "#df857b"].map(hex);
const OUTLINE = hex("#151335");

const image = (w, h) => ({ width: w, height: h, data: new Uint8Array(w * h * 4) });
const opaque = (im, x, y) => x >= 0 && y >= 0 && x < im.width && y < im.height && im.data[(y * im.width + x) * 4 + 3] > 0;
function paste(dst, src, ox, oy) {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const s = (y * src.width + x) * 4;
      if (src.data[s + 3] && x + ox >= 0 && y + oy >= 0 && x + ox < dst.width && y + oy < dst.height) {
        dst.data.set(src.data.subarray(s, s + 4), ((y + oy) * dst.width + x + ox) * 4);
      }
    }
  }
}

function encode(file, im) {
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
  ih.writeUInt32BE(im.width, 0);
  ih.writeUInt32BE(im.height, 4);
  ih[8] = 8;
  ih[9] = 6;
  const raw = Buffer.alloc((im.width * 4 + 1) * im.height);
  for (let y = 0; y < im.height; y++) Buffer.from(im.data.buffer, im.data.byteOffset + y * im.width * 4, im.width * 4).copy(raw, y * (im.width * 4 + 1) + 1);
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ih), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}

// --- the picture: key out its flat background, keep the pile (and anything beside it at
// least 3% of its size, like a roll), crop ---------------------------------------------

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "newspapers-"));
function cutOut(file) {
  const png = path.join(tmp, "source.png");
  execFileSync("sips", ["-s", "format", "png", file, "--out", png], { stdio: "ignore" });
  const im = readPng(png);
  const { width: w, height: h } = im;
  const bg = [0, 1, 2].map((c) => {
    let t = 0;
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) t += im.data[(y * w + x) * 4 + c];
    return t / 25;
  });
  const fg = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) fg[i] = Math.hypot(im.data[i * 4] - bg[0], im.data[i * 4 + 1] - bg[1], im.data[i * 4 + 2] - bg[2]) > 38 ? 1 : 0;
  const label = new Int32Array(w * h);
  const sizes = [0];
  for (let i = 0; i < w * h; i++) {
    if (!fg[i] || label[i]) continue;
    const id = sizes.length;
    let n = 0;
    const stack = [i];
    label[i] = id;
    while (stack.length) {
      const j = stack.pop();
      n++;
      const x = j % w;
      const y = Math.floor(j / w);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx;
        const Y = y + dy;
        const k = Y * w + X;
        if (X >= 0 && Y >= 0 && X < w && Y < h && fg[k] && !label[k]) {
          label[k] = id;
          stack.push(k);
        }
      }
    }
    sizes.push(n);
  }
  const biggest = Math.max(...sizes);
  const keep = (i) => label[i] && sizes[label[i]] >= biggest * 0.03;
  let [x0, y0, x1, y1] = [w, h, 0, 0];
  for (let i = 0; i < w * h; i++) {
    if (!keep(i)) continue;
    const x = i % w;
    const y = Math.floor(i / w);
    [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  }
  const out = image(x1 - x0 + 1, y1 - y0 + 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      if (!keep(i)) continue;
      const d = ((y - y0) * out.width + (x - x0)) * 4;
      out.data.set(im.data.subarray(i * 4, i * 4 + 3), d);
      out.data[d + 3] = 255;
    }
  }
  const cut = path.join(tmp, "cut.png");
  encode(cut, out);
  return cut;
}

// The cut-out at w x h: hard edges, his palette (coral only where the picture is clearly
// red), his outline around the silhouette.
function scaled(cut, w, h) {
  const file = path.join(tmp, "scaled.png");
  execFileSync("sips", ["-z", String(h), String(w), cut, "--out", file], { stdio: "ignore" });
  const im = readPng(file);
  for (let i = 0; i < im.data.length; i += 4) {
    im.data[i + 3] = im.data[i + 3] >= 128 ? 255 : 0;
    if (!im.data[i + 3]) continue;
    const [r, g, b] = im.data.subarray(i, i + 3);
    const red = r - g > 45 && r - b > 35;
    let best = PAL[0];
    let bd = Infinity;
    for (const c of red ? PAL : PAL.slice(0, 6)) {
      const d = 0.3 * (c[0] - r) ** 2 + 0.59 * (c[1] - g) ** 2 + 0.11 * (c[2] - b) ** 2;
      if (d < bd) [bd, best] = [d, c];
    }
    im.data.set(best, i);
  }
  const edge = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (opaque(im, x, y) && (!opaque(im, x - 1, y) || !opaque(im, x + 1, y) || !opaque(im, x, y - 1))) edge.push((y * w + x) * 4);
    }
  }
  for (const i of edge) im.data.set(OUTLINE, i);
  return im;
}

// --- piles, mound, climbing out -----------------------------------------------------------

function piles(cut) {
  const h5 = 5 * LAYER + PAD;
  const pile5 = image(W, h5);
  paste(pile5, scaled(cut, W, h5 - TOP), 0, TOP);
  const out = [];
  for (let n = 1; n <= 4; n++) {
    const h = n * LAYER + PAD;
    const im = image(W, h);
    for (let y = TOP; y < h; y++) {
      const s = ((h5 - h + y) * W) * 4;
      im.data.set(pile5.data.subarray(s, s + W * 4), y * W * 4);
    }
    for (let x = 0; x < W; x++) if (opaque(im, x, TOP)) im.data.set(OUTLINE, (TOP * W + x) * 4); // the cut top
    out.push(im);
  }
  out.push(pile5);
  return out;
}

// Stretched to the mound's box, then every pixel of him from frame row 60 down (resting
// or asleep) that would show takes the colour of the nearest paper below it (or above).
function buried(cut) {
  const im = scaled(cut, BURIED_W, BURIED_H);
  const off = -M.buried.moundOffsetX;
  for (const f of [...M.states.loaf.frames, ...M.states.sleep.frames]) {
    const him = readPng(path.join(CHERUB, f));
    for (let y = 60; y < him.height; y++) {
      for (let x = 0; x < him.width; x++) {
        const mx = x + off;
        const my = y - (him.height - BURIED_H);
        if (!him.data[(y * him.width + x) * 4 + 3] || mx < 0 || my < 0 || mx >= BURIED_W || my >= BURIED_H || opaque(im, mx, my)) continue;
        let from = -1;
        for (let d = 1; d < BURIED_H && from < 0; d++) {
          if (opaque(im, mx, my + d)) from = my + d;
          else if (opaque(im, mx, my - d)) from = my - d;
        }
        if (from >= 0) im.data.copyWithin((my * BURIED_W + mx) * 4, (from * BURIED_W + mx) * 4, (from * BURIED_W + mx) * 4 + 4);
      }
    }
  }
  return im;
}

// pile_5 sits in the mound's box at (pile offsetX - moundOffsetX, BURIED_H - its height).
function settling(cut, pile5) {
  const px = M.pile.offsetX - M.buried.moundOffsetX;
  const out = [];
  for (let k = 1; k <= SETTLE; k++) {
    const c = image(BURIED_W, BURIED_H);
    if (k === SETTLE) paste(c, pile5, px, BURIED_H - pile5.height);
    else {
      const t = k / SETTLE;
      const w = Math.round(BURIED_W + (W - BURIED_W) * t);
      const h = Math.round(BURIED_H + (pile5.height - TOP - BURIED_H) * t);
      const cx = BURIED_W / 2 + (px + W / 2 - BURIED_W / 2) * t;
      paste(c, scaled(cut, w, h), Math.round(cx - w / 2), BURIED_H - h);
    }
    out.push(c);
  }
  return out;
}

// --- loose pages for the burst: a thin page, tilted, a pixel of droop at one end --------

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
function loosePage(seed, angle) {
  const r = rng(seed);
  const len = 13;
  const [ca, sa] = [Math.cos(angle), Math.sin(angle)];
  const px = [];
  for (let y = -6; y <= 6; y++) {
    for (let x = -8; x <= 8; x++) {
      const u = Math.round(x * ca + y * sa + (len - 1) / 2);
      const v = Math.round(-x * sa + y * ca + 0.5);
      if (u < 0 || v < 0 || u >= len || v >= 2) continue;
      px.push({ x: x + 9, y: y + 7, c: v === 0 ? (u % 5 === 3 ? PAL[1] : PAL[0]) : u % 3 === 0 ? PAL[2] : PAL[1] });
    }
  }
  const edge = r() < 0.5 ? Math.min(...px.map((p) => p.x)) : Math.max(...px.map((p) => p.x));
  for (const p of px) if (p.x === edge) p.y += 1;
  const im = image(19, 15);
  for (const p of px) im.data.set([...p.c, 255], (p.y * 19 + p.x) * 4);
  const lit = [];
  for (let y = 0; y < 15; y++) {
    for (let x = 0; x < 19; x++) {
      if (opaque(im, x, y)) continue;
      if (opaque(im, x - 1, y) || opaque(im, x + 1, y) || opaque(im, x, y - 1) || opaque(im, x, y + 1)) lit.push((y * 19 + x) * 4);
    }
  }
  for (const i of lit) im.data.set([...OUTLINE, 255], i);
  // crop to content
  let [x0, y0, x1, y1] = [19, 15, 0, 0];
  for (let y = 0; y < 15; y++) for (let x = 0; x < 19; x++) if (opaque(im, x, y)) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  const out = image(x1 - x0 + 1, y1 - y0 + 1);
  paste(out, im, -x0, -y0);
  return out;
}

const cut = cutOut(SRC);
const pileDir = path.join(CHERUB, "pile");
const fxDir = path.join(CHERUB, "fx");
fs.mkdirSync(pileDir, { recursive: true });
fs.mkdirSync(fxDir, { recursive: true });
const ps = piles(cut);
ps.forEach((im, i) => {
  encode(path.join(pileDir, `pile_${i + 1}.png`), im);
});
encode(path.join(pileDir, "buried.png"), buried(cut));
settling(cut, ps[4]).forEach((im, i) => {
  encode(path.join(pileDir, `unbury_${i + 1}.png`), im);
});
encode(path.join(fxDir, "page_0.png"), loosePage(218, -0.35));
encode(path.join(fxDir, "page_1.png"), loosePage(219, 0.3));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`wrote ${pileDir}/pile_1..5, buried, unbury_1..${SETTLE} and ${fxDir}/page_0..1 from ${path.relative(process.cwd(), SRC)}`);
