// The cat's state machine. Pure: no DOM, no timers. The renderer calls tick(now)
// and draws the returned sprites. Coordinates are art pixels in the overlay
// strip, origin top-left, ground at the strip's bottom edge.

import type { Manifest } from "./manifest.ts";
import { catMode, type Inputs, pileHeight, pileLayers, stack } from "./state.ts";
import { arc, loopIndex, nextAt, type Rng, sequenceDuration, sequenceStep, tossPlan } from "./timeline.ts";

export type Sizes = Record<string, [number, number]>;

export type Sprite = {
  sprite: string;
  x: number;
  y: number;
  flip: boolean;
  hit: boolean; // part of the clickable cat/pile
};

// cadenceMs: how soon the next tick can change anything (fast during the click
// animation, one walk step while walking, slow while resting).
export type Frame = { sprites: Sprite[]; delivered: boolean; cadenceMs: number };

const BUSY_CADENCE_MS = 35;
const REST_CADENCE_MS = 100;

type Phase =
  | { kind: "idle" }
  | { kind: "hop"; start: number }
  | { kind: "waking"; start: number; layers: number }
  | { kind: "tossing"; start: number; layers: number; plan: number[]; rolls: { dir: 1 | -1; dist: number }[] };

const HOP = { ms: 160, y: -3 };

export class CatEngine {
  private m: Manifest;
  private sizes: Sizes;
  private rng: Rng;
  private stripW: number;
  private stripH: number;
  private inputs: Inputs = { unread: 0, editionAge: 0 };
  private x = 40;
  private facing: 1 | -1 = 1;
  private hovered = false;
  private lastStepAt: number;
  private steps = 0;
  private phase: Phase = { kind: "idle" };
  private restingSince: number; // start of the current loaf/sleep, for frame timing
  private restingMode: "loaf" | "sleep" | null = null;
  private extraNext: number[] = [];
  private extraUntil: number[] = [];

  constructor(m: Manifest, sizes: Sizes, strip: { width: number; height: number }, now: number, rng: Rng = Math.random) {
    this.m = m;
    this.sizes = sizes;
    this.rng = rng;
    this.stripW = strip.width;
    this.stripH = strip.height;
    this.lastStepAt = now;
    this.restingSince = now;
  }

  setStrip(strip: { width: number; height: number }): void {
    this.stripW = strip.width;
    this.stripH = strip.height;
    this.x = Math.max(0, Math.min(this.x, this.stripW - this.catW()));
  }

  setInputs(inputs: Inputs): void {
    this.inputs = { unread: Math.max(0, inputs.unread), editionAge: Math.max(0, inputs.editionAge) };
  }

  getInputs(): Inputs {
    return { ...this.inputs };
  }

  setHovered(hovered: boolean): void {
    this.hovered = hovered;
  }

  isBusy(): boolean {
    return this.phase.kind !== "idle";
  }

  // Click on the cat or pile: wake and toss the pile if there is one, else a small hop.
  click(now: number): "deliver" | "hop" | "ignored" {
    if (this.phase.kind !== "idle") return "ignored";
    const layers = pileLayers(this.inputs.unread, this.m.pile.unreadToLayers);
    if (layers > 0) {
      this.phase = { kind: "waking", start: now, layers };
      return "deliver";
    }
    this.phase = { kind: "hop", start: now };
    return "hop";
  }

  tick(now: number): Frame {
    let delivered = false;
    const p = this.phase;

    if (p.kind === "hop" && now - p.start >= HOP.ms) this.phase = { kind: "idle" };
    if (p.kind === "waking" && now - p.start >= sequenceDuration(this.m.sequences.wake_on_click.steps)) {
      const toss = this.m.sequences.wake_on_click.paperToss;
      const plan = tossPlan(p.layers, toss.maxRolls);
      const [lo, hi] = toss.distancePx;
      const rolls = plan.map((_, i) => ({
        dir: (i % 2 === 0 ? this.facing : -this.facing) as 1 | -1,
        dist: lo + Math.floor(this.rng() * (hi - lo + 1)),
      }));
      this.phase = { kind: "tossing", start: p.start + sequenceDuration(this.m.sequences.wake_on_click.steps), layers: p.layers, plan, rolls };
    }
    const q = this.phase;
    if (q.kind === "tossing" && now - q.start >= this.tossDuration(q.plan.length)) {
      this.phase = { kind: "idle" };
      this.inputs = { unread: 0, editionAge: 0 };
      delivered = true;
      this.lastStepAt = now;
    }

    const phase = this.phase;
    if (phase.kind === "waking") return { sprites: this.drawWaking(now, phase), delivered, cadenceMs: BUSY_CADENCE_MS };
    if (phase.kind === "tossing") return { sprites: this.drawTossing(now, phase), delivered, cadenceMs: BUSY_CADENCE_MS };

    const mode = catMode(this.inputs, this.m.behavior.sleepAfterEditions);
    if (mode === "walk") {
      this.restingMode = null;
      const hopping = phase.kind === "hop";
      return {
        sprites: this.drawWalk(now, hopping ? HOP.y : 0),
        delivered,
        cadenceMs: hopping ? BUSY_CADENCE_MS : this.m.behavior.walkStepMs,
      };
    }
    if (this.restingMode !== mode) this.enterRest(mode, now);
    return { sprites: mode === "loaf" ? this.drawLoaf(now) : this.drawSleep(now), delivered, cadenceMs: REST_CADENCE_MS };
  }

  // --- walking -------------------------------------------------------------

  private catW(): number {
    return this.m.states.walk.size[0];
  }

  private drawWalk(now: number, lift: number): Sprite[] {
    const b = this.m.behavior;
    const walk = this.m.states.walk;
    let n = Math.floor((now - this.lastStepAt) / b.walkStepMs);
    if (n > 0) {
      this.lastStepAt += n * b.walkStepMs;
      if (n > 1000) n = 1000; // after a long pause, do not replay every step
      if (!this.hovered) {
        for (let i = 0; i < n; i++) {
          this.x += this.facing * b.walkStepPx;
          const maxX = this.stripW - this.catW();
          if (this.x <= 0 || this.x >= maxX) {
            this.x = Math.max(0, Math.min(this.x, maxX));
            this.facing = this.facing === 1 ? -1 : 1;
          }
          this.steps++;
        }
      }
    }
    const frame = walk.frames[loopIndex(walk.frames.length, walk.frameMs, this.steps * b.walkStepMs)];
    const [, h] = walk.size;
    return [{ sprite: frame, x: this.x, y: this.stripH - h + lift, flip: this.facing === -1, hit: true }];
  }

  // --- resting on the pile -------------------------------------------------

  private enterRest(mode: "loaf" | "sleep", now: number): void {
    this.restingMode = mode;
    this.restingSince = now;
    this.extraNext = this.m.states.loaf.extras.map((e) => nextAt(now, e.everyMs, this.rng));
    this.extraUntil = this.m.states.loaf.extras.map(() => 0);
  }

  // Cat and pile placed so the stack's bottom row sits on the ground.
  private onPile(catSprite: string, catSize: [number, number], layers: number, catLift = 0): Sprite[] {
    const placed = stack(this.m, catSprite, catSize, layers, this.facing);
    const total = catSize[1] + (layers > 0 ? pileHeight(this.m, layers) - this.m.pile.catOverlap : 0);
    const top = this.stripH - total;
    return placed.map((p) => ({
      sprite: p.sprite,
      x: this.x + p.x,
      y: top + p.y + (p.sprite === catSprite ? catLift : 0),
      flip: p.flip,
      hit: true,
    }));
  }

  private layers(): number {
    return pileLayers(this.inputs.unread, this.m.pile.unreadToLayers);
  }

  private drawLoaf(now: number): Sprite[] {
    const loaf = this.m.states.loaf;
    let frame = loaf.frames[loopIndex(loaf.frames.length, loaf.frameMs, now - this.restingSince)];
    loaf.extras.forEach((e, i) => {
      if (now >= this.extraNext[i]) {
        this.extraUntil[i] = now + e.showMs;
        this.extraNext[i] = nextAt(this.extraUntil[i], e.everyMs, this.rng);
      }
    });
    // Earlier extras win (blink over tail flick).
    for (let i = loaf.extras.length - 1; i >= 0; i--) if (now < this.extraUntil[i]) frame = loaf.extras[i].frame;
    return this.onPile(frame, loaf.size, this.layers());
  }

  private drawSleep(now: number): Sprite[] {
    const sleep = this.m.states.sleep;
    const elapsed = now - this.restingSince;
    const frame = sleep.frames[loopIndex(sleep.frames.length, sleep.frameMs, elapsed)];
    const zElapsed = Math.floor(elapsed / sleep.zzz.stepMs) * sleep.zzz.stepMs;
    const sprites = this.onPile(frame, sleep.size, this.layers());
    const cat = sprites[sprites.length - 1];
    const z = sleep.zzz;
    for (let i = 0; i < z.count; i++) {
      const t = ((zElapsed + (i * z.riseMs) / z.count) % z.riseMs) / z.riseMs;
      const zf = z.frames[Math.min(z.frames.length - 1, Math.floor(t * z.frames.length))];
      const [zw, zh] = this.size(zf);
      const localX = z.origin[0] + Math.round(z.driftPx * t);
      const x = this.facing === 1 ? localX : sleep.size[0] - localX - zw;
      sprites.push({ sprite: zf, x: cat.x + x, y: cat.y + z.origin[1] - Math.round(z.risePx * t) - zh, flip: false, hit: false });
    }
    return sprites;
  }

  // --- click: wake, then toss the papers -----------------------------------

  private drawWaking(now: number, p: { start: number; layers: number }): Sprite[] {
    const step = sequenceStep(this.m.sequences.wake_on_click.steps, now - p.start);
    const s = step ?? this.m.sequences.wake_on_click.steps[this.m.sequences.wake_on_click.steps.length - 1];
    return this.onPile(s.frame, this.size(s.frame), p.layers, s.y);
  }

  private tossDuration(rolls: number): number {
    const t = this.m.sequences.wake_on_click.paperToss;
    return rolls === 0 ? 0 : (rolls - 1) * t.staggerMs + t.flightMs;
  }

  private drawTossing(now: number, p: { start: number; layers: number; plan: number[]; rolls: { dir: 1 | -1; dist: number }[] }): Sprite[] {
    const t = this.m.sequences.wake_on_click.paperToss;
    const elapsed = now - p.start;
    const launched = p.plan.filter((_, i) => elapsed >= i * t.staggerMs).length;
    const layersNow = launched === 0 ? p.layers : p.plan[launched - 1];
    const stand = this.m.states.walk.frames[0];
    const sprites = this.onPile(stand, this.m.states.walk.size, layersNow);

    const [rw, rh] = this.size(t.frame);
    const pileX = this.facing === 1 ? this.m.pile.offsetX : this.catW() - this.m.pile.offsetX - this.m.pile.width;
    const startX = this.x + pileX + Math.round((this.m.pile.width - rw) / 2);
    p.rolls.forEach((r, i) => {
      const flying = elapsed - i * t.staggerMs;
      if (flying < 0 || flying >= t.flightMs) return;
      const fromLayers = i === 0 ? p.layers : p.plan[i - 1];
      const startY = this.stripH - pileHeight(this.m, fromLayers) - rh;
      const { dx, dy } = arc(flying / t.flightMs, r.dir * r.dist, t.arcHeightPx);
      // Land on the ground: blend the start height down to ground level over the flight.
      const fall = Math.round((this.stripH - rh - startY) * (flying / t.flightMs));
      sprites.push({ sprite: t.frame, x: startX + dx, y: startY + dy + fall, flip: r.dir === -1, hit: false });
    });
    return sprites;
  }

  private size(sprite: string): [number, number] {
    const s = this.sizes[sprite];
    if (!s) throw new Error(`no size for sprite ${sprite}`);
    return s;
  }
}
