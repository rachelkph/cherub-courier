// Draws the character engine's sprites on the transparent overlay strip and hit-tests
// the cursor against their pixels so clicks pass through everywhere else.

import { CatEngine, type Sizes, type Sprite } from "./engine/cat.ts";
import { parseManifest, spritePaths } from "./engine/manifest.ts";

type Bounds = { width: number; height: number; scale: number };
type CatState = { unread: number; editionAge: number };
type CatBox = { x: number; y: number; width: number; height: number };
declare global {
  interface Window {
    overlay: {
      setInteractive(interactive: boolean): void;
      getBounds(): Promise<Bounds>;
      onBounds(cb: (b: Bounds) => void): void;
      onVisible(cb: (visible: boolean) => void): void;
      getCatState(): Promise<CatState>;
      onCatState(cb: (s: CatState) => void): void;
      clicked(box: CatBox): void;
      delivered(box: CatBox): void;
      onPopoverVisible(cb: (visible: boolean) => void): void;
    };
  }
}

// The character's art folder (main passes ?character=; it matches CHARACTERS in
// shared/config.ts, which is not served to pages). The cat's art is at the top.
const CHARACTER_DIRS: Record<string, string> = { cat: "", cherub: "cherub/" };
const characterParam = new URLSearchParams(location.search).get("character") ?? "cat";
const ASSETS = `app://newscat/assets/${Object.hasOwn(CHARACTER_DIRS, characterParam) ? CHARACTER_DIRS[characterParam] : ""}`;

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

const images = new Map<string, HTMLImageElement>();
const masks = new Map<string, Uint8ClampedArray>();
let bounds: Bounds = { width: 0, height: 0, scale: 1 };
let engine: CatEngine | undefined;
let sprites: Sprite[] = [];
let lastKey = "";
// Area drawn last frame, in art px, so a redraw only clears what changed.
let lastBox: Box | null = null;
type Box = { x0: number; y0: number; x1: number; y1: number };
let mouse: { x: number; y: number } | null = null;
let interactive = false;
let timer: number | undefined;

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = ASSETS + src;
  });
}

function alphaMask(img: HTMLImageElement): Uint8ClampedArray {
  const c = new OffscreenCanvas(img.width, img.height);
  const g = c.getContext("2d") as OffscreenCanvasRenderingContext2D;
  g.drawImage(img, 0, 0);
  return g.getImageData(0, 0, img.width, img.height).data;
}

function strip() {
  return { width: Math.floor(bounds.width / bounds.scale), height: Math.floor(bounds.height / bounds.scale) };
}

let k = 1; // device pixels per art pixel
const dev = (artPx: number) => Math.round(artPx * k);

function resize(): void {
  const dpr = window.devicePixelRatio;
  canvas.style.width = `${bounds.width}px`;
  canvas.style.height = `${bounds.height}px`;
  canvas.width = Math.round(bounds.width * dpr);
  canvas.height = Math.round(bounds.height * dpr);
  // Drawing is in device pixels: one art pixel = scale * dpr of them. A whole number
  // keeps pixels crisp; otherwise (the cherub at 2/3) smooth, at whole-pixel positions.
  k = dpr * bounds.scale;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = !Number.isInteger(k);
  ctx.imageSmoothingQuality = "high";
  lastKey = "";
  lastBox = null;
}

function boxOf(list: Sprite[]): Box | null {
  let box: Box | null = null;
  for (const s of list) {
    const img = images.get(s.sprite) as HTMLImageElement;
    const b = { x0: s.x, y0: s.y, x1: s.x + img.width, y1: s.y + img.height };
    box = box ? { x0: Math.min(box.x0, b.x0), y0: Math.min(box.y0, b.y0), x1: Math.max(box.x1, b.x1), y1: Math.max(box.y1, b.y1) } : b;
  }
  return box;
}

function draw(): void {
  const key = sprites.map((s) => `${s.sprite}@${s.x},${s.y},${s.flip}`).join("|");
  if (key === lastKey) return;
  lastKey = key;
  const next = boxOf(sprites);
  // Clear and redraw only the union of the old and new sprite areas.
  const parts = [lastBox, next].filter((b): b is Box => b !== null);
  lastBox = next;
  if (parts.length === 0) return;
  const dirty = parts.reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }));
  // In device px, one pixel wider on each side for rounding.
  const [x0, y0] = [dev(dirty.x0) - 1, dev(dirty.y0) - 1];
  const [w, h] = [dev(dirty.x1) + 1 - x0, dev(dirty.y1) + 1 - y0];
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, w, h);
  ctx.clip();
  ctx.clearRect(x0, y0, w, h);
  for (const s of sprites) {
    const img = images.get(s.sprite) as HTMLImageElement;
    const [dx, dy, dw, dh] = [dev(s.x), dev(s.y), dev(img.width), dev(img.height)];
    if (s.flip) {
      ctx.save();
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(img, dx, dy, dw, dh);
    }
  }
  ctx.restore();
}

// Is the CSS point over an opaque pixel of the character or its pile?
function hit(px: number, py: number): boolean {
  const ax = Math.floor(px / bounds.scale);
  const ay = Math.floor(py / bounds.scale);
  for (const s of sprites) {
    if (!s.hit) continue;
    const img = images.get(s.sprite) as HTMLImageElement;
    let lx = ax - s.x;
    const ly = ay - s.y;
    if (lx < 0 || ly < 0 || lx >= img.width || ly >= img.height) continue;
    if (s.flip) lx = img.width - 1 - lx;
    if ((masks.get(s.sprite) as Uint8ClampedArray)[(ly * img.width + lx) * 4 + 3] > 0) return true;
  }
  return false;
}

function updateInteractive(): void {
  const next = mouse !== null && hit(mouse.x, mouse.y);
  if (next !== interactive) {
    interactive = next;
    engine?.setHovered(next);
    window.overlay.setInteractive(next);
  }
}

let running = false;

function tick(): void {
  if (!engine) return;
  const frame = engine.tick(performance.now());
  sprites = frame.sprites;
  if (frame.delivered) {
    const box = catBoxCss();
    if (box) window.overlay.delivered(box);
  }
  draw();
  updateInteractive();
  if (running) {
    window.clearTimeout(timer);
    timer = window.setTimeout(tick, frame.cadenceMs);
  }
}

function start(): void {
  if (running) return;
  running = true;
  tick();
}
function stop(): void {
  running = false;
  window.clearTimeout(timer);
  timer = undefined;
}

window.addEventListener("mousemove", (e) => {
  mouse = { x: e.clientX, y: e.clientY };
  updateInteractive();
});
window.addEventListener("mouseleave", () => {
  mouse = null;
  updateInteractive();
});
// The cat's own box in CSS px (art px times scale), for anchoring the popover.
function catBoxCss(): CatBox | null {
  const b = engine?.catBox(sprites);
  if (!b) return null;
  const s = bounds.scale;
  return { x: b.x * s, y: b.y * s, width: b.width * s, height: b.height * s };
}

window.addEventListener("mousedown", (e) => {
  if (!engine || !hit(e.clientX, e.clientY)) return;
  // With a pile: wake, toss the papers, then main opens the popover (on "delivered").
  // Without one: hop, and open (or close) the popover right away.
  const result = engine.click(performance.now());
  tick();
  if (result === "hop") {
    const box = catBoxCss();
    if (box) window.overlay.clicked(box);
  }
});

// Listen before any await so updates sent while loading are not lost.
let latestState: CatState | null = null;
window.overlay.onBounds((b) => {
  bounds = b;
  if (!engine) return;
  engine.setStrip(strip());
  resize();
  tick();
});
window.overlay.onCatState((s) => {
  latestState = s;
  engine?.setInputs(s);
});
window.overlay.onVisible((v) => (v ? start() : stop()));
window.overlay.onPopoverVisible((v) => engine?.setPaused(v));

const manifest = parseManifest(await (await fetch(`${ASSETS}manifest.json`)).json());
const [initialBounds, initialState] = await Promise.all([
  window.overlay.getBounds(),
  window.overlay.getCatState(),
  ...spritePaths(manifest).map(async (p) => images.set(p, await load(p))),
]);
for (const [p, img] of images) masks.set(p, alphaMask(img));
const sizes: Sizes = Object.fromEntries([...images].map(([p, img]) => [p, [img.width, img.height]]));

if (bounds.width === 0) bounds = initialBounds;
engine = new CatEngine(manifest, sizes, strip(), performance.now());
engine.setInputs(latestState ?? initialState);

resize();
start();
