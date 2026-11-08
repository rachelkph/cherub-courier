// M0 spike: one walking sprite with per-pixel hit testing. Replaced by the
// manifest-driven cat engine in M1.

type Bounds = { width: number; height: number; scale: number };
declare global {
  interface Window {
    overlay: {
      setInteractive(interactive: boolean): void;
      catClicked(): void;
      onBounds(cb: (b: Bounds) => void): void;
      onVisible(cb: (visible: boolean) => void): void;
    };
  }
}

const FRAMES = ["walk_0", "walk_1", "walk_2", "walk_3"].map((f) => `app://newscat/assets/walk/${f}.png`);
const FRAME_MS = 140;
const STEP_MS = 70; // move one art pixel per step; two steps per frame
const W = 63;
const H = 58;

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

let bounds: Bounds = { width: 0, height: 0, scale: 0 };
let haveBounds = false; // nothing draws until main sends real bounds
let images: HTMLImageElement[] = [];
let masks: Uint8ClampedArray[] = [];
let x = 40; // CSS px, left edge of sprite
let dir: 1 | -1 = 1;
let frame = 0;
let step = 0;
let hop = 0; // art px above baseline
let mouse: { x: number; y: number } | null = null;
let interactive = false;
let timer: number | undefined;

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

function alphaMask(img: HTMLImageElement): Uint8ClampedArray {
  const c = new OffscreenCanvas(img.width, img.height);
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0);
  return g.getImageData(0, 0, img.width, img.height).data;
}

function resize(): void {
  const dpr = window.devicePixelRatio;
  canvas.style.width = `${bounds.width}px`;
  canvas.style.height = `${bounds.height}px`;
  canvas.width = Math.round(bounds.width * dpr);
  canvas.height = Math.round(bounds.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  x = Math.min(x, bounds.width - W * bounds.scale);
}

function spriteTop(): number {
  return bounds.height - (H + hop) * bounds.scale;
}

// Is the CSS point over an opaque pixel of the current frame?
function hit(px: number, py: number): boolean {
  const s = bounds.scale;
  let ax = Math.floor((px - x) / s);
  const ay = Math.floor((py - spriteTop()) / s);
  if (ax < 0 || ay < 0 || ax >= W || ay >= H) return false;
  if (dir === -1) ax = W - 1 - ax;
  return masks[frame][(ay * W + ax) * 4 + 3] > 0;
}

function updateInteractive(): void {
  const next = mouse !== null && hit(mouse.x, mouse.y);
  if (next !== interactive) {
    interactive = next;
    window.overlay.setInteractive(next);
  }
}

function draw(): void {
  const s = bounds.scale;
  ctx.clearRect(0, 0, bounds.width, bounds.height);
  ctx.save();
  if (dir === -1) {
    ctx.translate(x + W * s, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(images[frame], 0, spriteTop(), W * s, H * s);
  } else {
    ctx.drawImage(images[frame], x, spriteTop(), W * s, H * s);
  }
  ctx.restore();
}

function tick(): void {
  // Stand still while hovered so the cat is clickable.
  if (!interactive) {
    const s = bounds.scale;
    x += dir * s;
    if (x <= 0 || x >= bounds.width - W * s) {
      dir = dir === 1 ? -1 : 1;
      x = Math.max(0, Math.min(x, bounds.width - W * s));
    }
    step++;
    if (step * STEP_MS >= FRAME_MS) {
      step = 0;
      frame = (frame + 1) % FRAMES.length;
    }
  }
  draw();
  updateInteractive();
}

function start(): void {
  if (timer === undefined) timer = window.setInterval(tick, STEP_MS);
}
function stop(): void {
  if (timer !== undefined) window.clearInterval(timer);
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
window.addEventListener("mousedown", (e) => {
  if (!hit(e.clientX, e.clientY)) return;
  window.overlay.catClicked();
  hop = 5;
  draw();
  window.setTimeout(() => {
    hop = 0;
    draw();
  }, 150);
});

window.overlay.onBounds((b) => {
  bounds = b;
  haveBounds = true;
  if (!images.length) return; // first draw happens after load
  resize();
  draw();
  start();
});
window.overlay.onVisible((v) => (v ? start() : stop()));

images = await Promise.all(FRAMES.map(load));
masks = images.map(alphaMask);
if (haveBounds) {
  resize();
  start();
}

export {};
