// Draws the cherub's newspaper mound: assets/cherub/pile/pile_1..5.png (80 x 7n+3)
// and buried.png (the heap he is buried in up to the neck),
// a dome of folded and rolled papers in the cherub's palette, with a level top
// for his feet. Deterministic: same output every run. The PNGs stay out of git
// like the rest of the art; this script is how to remake them.
// Usage: node scripts/mound.mjs [outDir]
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

function encode(file, { w, h, data }) {
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
  for (let y = 0; y < h; y++) Buffer.from(data.buffer, data.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ih), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}
const W = 80, LAYER = 7, PAD = 3;
const C = { O: "#151335", O2: "#302f52", P0: "#fef8dd", P1: "#f9ecd0", P2: "#d8d4c7", P3: "#b0a9a7", T: "#62485b", R: "#b2606b", R2: "#df857b" };
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function canvas(w, h) { return { w, h, px: new Array(w * h).fill(null) }; }
// shade: 0 in the light; 1 for papers low in the heap (one step darker).
let shade = 0;
const DARKER = { P0: "P1", P1: "P2", P2: "P3", P3: "O2", R2: "R" };
const set = (c, x, y, k) => { if (x >= 0 && y >= 0 && x < c.w && y < c.h && k) c.px[y * c.w + x] = shade && DARKER[k] ? DARKER[k] : k; };

// Folded paper: a slab w wide whose base runs from (x, yb) with a slope.
// Per column, top to bottom: outline, face (P0, print row, P1), page edges (P2/P3), outline.
function slab(c, x, yb, w, slope, r, band) {
  const words = []; let i = 2;
  while (i < w - 3) { const n = 2 + Math.floor(r() * 3); for (let k = 0; k < n && i < w - 3; k++) words.push(i++); i++; }
  const printed = new Set(words);
  for (let i = 0; i < w; i++) {
    const b = yb + Math.round(i * slope);
    const end = i === 0 || i === w - 1;
    const col = end ? ["O", "O", "O", "O", "O", "O"] : ["P0", printed.has(i) ? "P3" : "P1", "P1", "P2", i % 2 ? "P3" : "P2", "O"];
    if (band !== null && !end && (i === band || i === band + 1)) { col[0] = "R2"; col[1] = "R"; col[2] = "R"; col[3] = "R"; col[4] = "R"; }
    // top outline
    if (!end) set(c, x + i, b - 7, "O");
    col.forEach((k, j) => {
      set(c, x + i, b - 6 + j, end && j === 0 ? null : k);
    });
    if (end) { for (let j = -5; j <= -1; j++) set(c, x + i, b + j, "O"); }
  }
}

// Rolled paper, side view, 8 tall: rounded left end, spiral at the right end.
function roll(c, x, yb, w, flip, band) {
  const rows = ["P0", "T", "P1", "P1", "P2", "P3"];
  for (let i = 0; i < w; i++) {
    const X = flip ? x + w - 1 - i : x + i;
    if (i === 0) { for (let j = -5; j <= -2; j++) set(c, X, yb + j, "O"); continue; }
    set(c, X, yb - 7, i === 1 ? null : "O");
    set(c, X, yb, i === 1 ? null : "O");
    if (i === 1) { set(c, X, yb - 6, "O"); set(c, X, yb - 1, "O"); }
    rows.forEach((k, j) => {
      let col = k;
      if (k === "T" && (i < 3 || i > w - 5 || i % 4 === 0)) col = "P1";
      if (i === band || i === band + 1) col = j < 2 ? "R2" : "R";
      if (i === 1 && (j === 0 || j === 5)) return;
      set(c, X, yb - 6 + j, col);
    });
    if (i === w - 1) { for (let j = -6; j <= -1; j++) set(c, X, yb + j, "O"); }
    if (i === w - 3) { set(c, X, yb - 4, "O2"); set(c, X, yb - 3, "P3"); }
    if (i === w - 2) { set(c, X, yb - 5, "P2"); set(c, X, yb - 4, "P2"); set(c, X, yb - 3, "O2"); set(c, X, yb - 2, "P2"); }
  }
}

// End-on roll, 8x8.
const END = ["..OOOO..", ".OP0P0P1P1O.", "OP0P2P2P2P1O", "OP1P2O2P3P2P1O", "OP1P2P3P2P2P1O", "OP1P1P2P2P3O", ".OP2P3P3O.", "..OOOO.."];
function endOn(c, x, yb) {
  END.forEach((s, j) => { let i = 0; for (const k of s.match(/P[0-3]|O2|O|\./g)) { if (k !== ".") set(c, x + i, yb - 7 + j, k); i++; } });
}


// A heap w x H: half-width baseHalf at the ground rounding in to topHalf at the
// top. level: the top band lies flat (something stands on it).
// halfAt(yb), if given, replaces that shape: the half-width at band line yb.
function heap({ w: Wd, h: H, topHalf, baseHalf, r, level, halfAt: shape }) {
  const c = canvas(Wd, H);
  const base = H - 1; // ground row
  const top = 2;
  const b = base - top; // mound height
  // Dome: wide at the ground, rounding in to the level top.
  const halfAt = shape ?? ((yb) => { const h = (base - yb) / Math.max(1, b - 5); return topHalf + (baseHalf - topHalf) * Math.sqrt(Math.max(0, 1 - Math.min(1, h) ** 2));
    });
  // Bands every 5 px from the top down; lower bands are in front, drawn later.
  const bands = [];
  for (let y = top + 7; y <= base + 1; y += 5) bands.push(y);
  if (bands.at(-1) !== base) bands.push(base);
  bands.forEach((yb, bi) => {
    const hw = halfAt(yb);
    const first = bi === 0 && level;
    let x = Math.round(Wd / 2 - hw) - (first ? 0 : Math.floor(r() * 2));
    const right = Math.round(Wd / 2 + hw);
    const items = [];
    while (x < right - 6) {
      const room = right - x;
      const t = r();
      let it;
      if (!first && t < 0.2 && room >= 8) it = { k: "end", w: 8 };
      else if (!first && t < 0.5 && room >= 13) it = { k: "roll", w: Math.min(room, 13 + Math.floor(r() * 5)), flip: r() < 0.5 };
      else it = { k: "slab", w: Math.max(8, Math.min(room, 15 + Math.floor(r() * 8))) };
      it.x = x;
      it.yb = yb - (first ? 0 : Math.floor(r() * 2));
      // Papers at the edges slide down the slope; the rest lie nearly flat.
      const mid = it.x + it.w / 2 - Wd / 2;
      const edge = !first && Math.abs(mid) > hw - 12;
      it.slope = it.k !== "slab" || first ? 0 : edge ? Math.sign(mid) * (0.12 + r() * 0.1) : (r() - 0.5) * 0.1;
      if (it.slope > 0) it.yb -= Math.round(it.w * it.slope); // keep the low end on the band
      it.band = r() < 0.22 ? 3 + Math.floor(r() * Math.max(1, it.w - 8)) : null;
      items.push(it);
      x += it.w - 2 - Math.floor(r() * 3);
    }
    items.sort(() => r() - 0.5);
    // The bottom band of a tall heap sits in the shade of the papers above it.
    shade = bands.length >= 4 && bi === bands.length - 1 ? 1 : 0;
    for (const it of items) {
      if (it.k === "slab") slab(c, it.x, it.yb, it.w, it.slope, r, it.band);
      else if (it.k === "roll") roll(c, it.x, it.yb, it.w, it.flip, it.band ?? Math.floor(it.w / 3));
      else endOn(c, it.x, it.yb);
    }
    shade = 0;
  });
  // The smallest heap: rolls tucked against both ends round it off.
  if (bands.length === 1) { endOn(c, Math.round(Wd / 2 - topHalf) - 4, base); endOn(c, Math.round(Wd / 2 + topHalf) - 4, base); }
  return c;
}

// Pile stage n (1..5): 80 x (7n+3), level top for his feet (they span 36 px).
function stage(n, seed = 7) {
  return heap({ w: W, h: LAYER * n + PAD, topHalf: 19, baseHalf: Math.min(40, 21 + 4 * n), r: rng(seed * 131 + n * 7919), level: true });
}

// Buried: the big heap drawn in front of him, up to his chin, BURIED_W x BURIED_H.
// It covers his body (frame x 7..93) from the neck (frame row 57) down; the wing
// tips stay out.
// Its surface falls off as (dx / half)^3.5 from the middle: still high (row <= 7)
// over his satchel 39 px out, then sloping to the ground.
export const BURIED_W = 136;
export const BURIED_H = 46;
function buried(seed = 7) {
  const half = BURIED_W / 2;
  const top = BURIED_H - 1;
  // At band line yb (height above ground top - yb), the surface is that high out to:
  const halfAt = (yb) => Math.max(10, half * Math.max(0, 1 - (top - yb) / top) ** (1 / 3.5));
  return heap({ w: BURIED_W, h: BURIED_H, r: rng(seed * 977 + 31), level: false, halfAt });
}

// Gaps between papers inside the heap (opaque to the left, right and above) are
// dark crevices, so nothing behind shows through.
function fillGaps(c) {
  const at = (x, y) => c.px[y * c.w + x];
  for (let y = 1; y < c.h; y++) {
    for (let x = 1; x < c.w - 1; x++) {
      if (at(x, y)) continue;
      let l = false;
      let r = false;
      let u = false;
      for (let i = x - 1; i >= 0 && !l; i--) l = !!at(i, y);
      for (let i = x + 1; i < c.w && !r; i++) r = !!at(i, y);
      for (let j = y - 1; j >= 0 && !u; j--) u = !!at(x, j);
      if (l && r && u) c.px[y * c.w + x] = "O2";
    }
  }
  return c;
}

function save(c, file) {
  const data = new Uint8Array(c.w * c.h * 4);
  c.px.forEach((k, i) => {
    if (k) {
      data.set(rgb(C[k]), i * 4);
      data[i * 4 + 3] = 255;
    }
  });
  encode(file, { w: c.w, h: c.h, data });
}

function write(dir, seed) {
  for (let n = 1; n <= 5; n++) save(fillGaps(stage(n, seed)), `${dir}/pile_${n}.png`);
  save(fillGaps(buried(seed)), `${dir}/buried.png`);
}

const out = process.argv[2] ?? path.join(import.meta.dirname, "..", "assets", "cherub", "pile");
fs.mkdirSync(out, { recursive: true });
write(out, 7);
console.log(`wrote ${out}/pile_1..5.png and buried.png`);
