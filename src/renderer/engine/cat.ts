// The character's state machine (the cat, or a flier like the cherub). Pure: no DOM,
// no timers. The renderer calls tick(now) and draws the returned sprites.
// Coordinates are art pixels in the overlay strip, origin top-left, ground at the
// strip's bottom edge.

import type { Extra, LoopState, Manifest } from "./manifest.ts";
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

// airborne: clicked while carrying the news in flight (no pile to stand on).
type Phase =
  | { kind: "idle" }
  | { kind: "hop"; start: number }
  | { kind: "waking"; start: number; layers: number; airborne: boolean }
  | { kind: "tossing"; start: number; layers: number; airborne: boolean; plan: number[]; rolls: { dir: 1 | -1; dist: number }[] };

const HOP = { ms: 160, y: -3 };

// When each occasional frame (a blink, a tail flick) next shows, and until when.
type ExtraClock = { next: number[]; until: number[] };

function startExtras(extras: Extra[], now: number, rng: Rng): ExtraClock {
  return { next: extras.map((e) => nextAt(now, e.everyMs, rng)), until: extras.map(() => 0) };
}

// The frame to show: an extra while it is up (earlier extras win), else `frame`.
function withExtras(extras: Extra[], clock: ExtraClock, now: number, frame: string, rng: Rng): string {
  extras.forEach((e, i) => {
    if (now >= clock.next[i]) {
      clock.until[i] = now + e.showMs;
      clock.next[i] = nextAt(clock.until[i], e.everyMs, rng);
    }
  });
  let out = frame;
  for (let i = extras.length - 1; i >= 0; i--) if (now < clock.until[i]) out = extras[i].frame;
  return out;
}

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
  private paused = false; // popover open: stand still so it stays anchored
  private lastStepAt: number;
  private steps = 0;
  private phase: Phase = { kind: "idle" };
  private restingSince: number; // start of the current loaf/sleep, for frame timing
  private restingMode: "loaf" | "sleep" | null = null;
  private restExtras: ExtraClock = { next: [], until: [] };
  private hoverExtras: ExtraClock;
  private turnUntil = 0; // fliers hover in place for a moment after turning around

  constructor(m: Manifest, sizes: Sizes, strip: { width: number; height: number }, now: number, rng: Rng = Math.random) {
    this.m = m;
    this.sizes = sizes;
    this.rng = rng;
    this.stripW = strip.width;
    this.stripH = strip.height;
    this.lastStepAt = now;
    this.restingSince = now;
    this.hoverExtras = startExtras(m.states.hover?.extras ?? [], now, rng);
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

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  // The cat's own sprite box (not the pile or effects), for anchoring the popover.
  catBox(sprites: Sprite[]): { x: number; y: number; width: number; height: number } | null {
    const cat = sprites.filter((s) => s.hit && !this.m.pile.files.includes(s.sprite)).at(-1);
    if (!cat) return null;
    const [w, h] = this.size(cat.sprite);
    return { x: cat.x, y: cat.y, width: w, height: h };
  }

  isBusy(): boolean {
    return this.phase.kind !== "idle";
  }

  private mode() {
    const b = this.m.behavior;
    return catMode(this.inputs, b.sleepAfterEditions, b.restAfterEditions);
  }

  private wakeSteps(airborne: boolean) {
    const seq = this.m.sequences;
    return airborne && seq.wake_in_flight ? seq.wake_in_flight.steps : seq.wake_on_click.steps;
  }

  // Click on the cat or pile (or a flier carrying the news): wake and toss the
  // papers if there are any, else a small hop.
  click(now: number): "deliver" | "hop" | "ignored" {
    if (this.phase.kind !== "idle") return "ignored";
    const layers = pileLayers(this.inputs.unread, this.m.pile.unreadToLayers);
    if (layers > 0) {
      this.phase = { kind: "waking", start: now, layers, airborne: this.mode() === "carry" };
      return "deliver";
    }
    this.phase = { kind: "hop", start: now };
    return "hop";
  }

  tick(now: number): Frame {
    let delivered = false;
    const p = this.phase;

    if (p.kind === "hop" && now - p.start >= HOP.ms) this.phase = { kind: "idle" };
    if (p.kind === "waking" && now - p.start >= sequenceDuration(this.wakeSteps(p.airborne))) {
      const toss = this.m.sequences.wake_on_click.paperToss;
      const plan = tossPlan(p.layers, toss.maxRolls);
      const [lo, hi] = toss.distancePx;
      const rolls = plan.map((_, i) => ({
        dir: (i % 2 === 0 ? this.facing : -this.facing) as 1 | -1,
        dist: lo + Math.floor(this.rng() * (hi - lo + 1)),
      }));
      this.phase = { kind: "tossing", start: p.start + sequenceDuration(this.wakeSteps(p.airborne)), layers: p.layers, airborne: p.airborne, plan, rolls };
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

    const mode = this.mode();
    if (mode === "walk" || mode === "carry") {
      this.restingMode = null;
      const hopping = phase.kind === "hop";
      const moving = this.drawMoving(now, hopping ? HOP.y : 0, mode);
      return { sprites: moving.sprites, delivered, cadenceMs: hopping ? BUSY_CADENCE_MS : moving.cadenceMs };
    }
    if (this.restingMode !== mode) this.enterRest(mode, now);
    return { sprites: mode === "loaf" ? this.drawLoaf(now) : this.drawSleep(now), delivered, cadenceMs: REST_CADENCE_MS };
  }

  // --- walking (or flying) --------------------------------------------------

  private catW(): number {
    return this.m.states.walk.size[0];
  }

  // The loop for walking, or for carrying this much news; its pace; its shadow.
  private moveLoop(mode: "walk" | "carry"): { loop: LoopState; stepMs: number; shadow: string | null } {
    const walkStepMs = this.m.behavior.walkStepMs;
    const shadow = this.m.flight?.shadow ?? null;
    if (mode === "carry") {
      const c = (this.m.states.carry ?? []).filter((x) => this.inputs.unread >= x.minUnread).at(-1);
      if (c) return { loop: c, stepMs: c.stepMs ?? walkStepMs, shadow: c.shadow ?? shadow };
    }
    return { loop: this.m.states.walk, stepMs: walkStepMs, shadow };
  }

  // A flier's sprite at its altitude, with its shadow on the ground below.
  private inFlight(frame: string, lift: number, shadow: string | null): Sprite[] {
    const fl = this.m.flight;
    const [, h] = this.size(frame);
    const out: Sprite[] = [];
    if (fl && shadow) {
      const [sw, sh] = this.size(shadow);
      const cx = this.facing === 1 ? fl.shadowCenterX : this.catW() - fl.shadowCenterX;
      out.push({ sprite: shadow, x: this.x + Math.round(cx - sw / 2), y: this.stripH - sh, flip: false, hit: false });
    }
    out.push({ sprite: frame, x: this.x, y: this.stripH - h - (fl?.altitudePx ?? 0) + lift, flip: this.facing === -1, hit: true });
    return out;
  }

  private drawMoving(now: number, lift: number, mode: "walk" | "carry"): { sprites: Sprite[]; cadenceMs: number } {
    const b = this.m.behavior;
    const fl = this.m.flight;
    const hover = this.m.states.hover;
    const { loop, stepMs, shadow } = this.moveLoop(mode);
    let n = Math.floor((now - this.lastStepAt) / stepMs);
    if (n > 0) {
      this.lastStepAt += n * stepMs;
      if (n > 1000) n = 1000; // after a long pause, do not replay every step
      if (!this.hovered && !this.paused && now >= this.turnUntil) {
        for (let i = 0; i < n; i++) {
          this.x += this.facing * b.walkStepPx;
          const maxX = this.stripW - this.catW();
          this.steps++;
          if (this.x <= 0 || this.x >= maxX) {
            this.x = Math.max(0, Math.min(this.x, maxX));
            this.facing = this.facing === 1 ? -1 : 1;
            if (fl && fl.turnHoverMs > 0) {
              this.turnUntil = now + fl.turnHoverMs;
              break;
            }
          }
        }
      }
    }
    // A flier keeps flapping when still; the cat's legs move only as it walks.
    const still = this.hovered || this.paused || now < this.turnUntil;
    if (hover && still && mode === "walk") {
      const frame = withExtras(hover.extras, this.hoverExtras, now, hover.frames[loopIndex(hover.frames.length, hover.frameMs, now)], this.rng);
      return { sprites: this.inFlight(frame, lift, shadow), cadenceMs: Math.min(stepMs, hover.frameMs, REST_CADENCE_MS) };
    }
    const t = fl ? now : this.steps * b.walkStepMs;
    const frame = loop.frames[loopIndex(loop.frames.length, loop.frameMs, t)];
    return { sprites: this.inFlight(frame, lift, shadow), cadenceMs: fl ? Math.min(stepMs, loop.frameMs) : stepMs };
  }

  // --- resting on the pile -------------------------------------------------

  private enterRest(mode: "loaf" | "sleep", now: number): void {
    this.restingMode = mode;
    this.restingSince = now;
    this.restExtras = startExtras(this.m.states.loaf.extras, now, this.rng);
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
    // Earlier extras win (blink over tail flick).
    const frame = withExtras(loaf.extras, this.restExtras, now, loaf.frames[loopIndex(loaf.frames.length, loaf.frameMs, now - this.restingSince)], this.rng);
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

  private drawWaking(now: number, p: { start: number; layers: number; airborne: boolean }): Sprite[] {
    const steps = this.wakeSteps(p.airborne);
    const s = sequenceStep(steps, now - p.start) ?? steps[steps.length - 1];
    if (p.airborne) return this.inFlight(s.frame, s.y, this.moveLoop("carry").shadow);
    return this.onPile(s.frame, this.size(s.frame), p.layers, s.y);
  }

  private tossDuration(rolls: number): number {
    const t = this.m.sequences.wake_on_click.paperToss;
    return rolls === 0 ? 0 : (rolls - 1) * t.staggerMs + t.flightMs;
  }

  private drawTossing(
    now: number,
    p: { start: number; layers: number; airborne: boolean; plan: number[]; rolls: { dir: 1 | -1; dist: number }[] },
  ): Sprite[] {
    const t = this.m.sequences.wake_on_click.paperToss;
    const elapsed = now - p.start;
    const launched = p.plan.filter((_, i) => elapsed >= i * t.staggerMs).length;
    const layersNow = launched === 0 ? p.layers : p.plan[launched - 1];
    // The cat stands to toss; a flier hovers where the wake sequence left him.
    const steps = this.wakeSteps(p.airborne);
    const lift = steps[steps.length - 1].y;
    const hover = this.m.states.hover;
    const stand = hover ? hover.frames[loopIndex(hover.frames.length, hover.frameMs, now)] : this.m.states.walk.frames[0];
    const sprites = p.airborne ? this.inFlight(stand, lift, this.moveLoop("walk").shadow) : this.onPile(stand, this.size(stand), layersNow, lift);

    const [rw, rh] = this.size(t.frame);
    const fl = this.m.flight;
    const pileX = this.facing === 1 ? this.m.pile.offsetX : this.catW() - this.m.pile.offsetX - this.m.pile.width;
    // In flight, rolls leave the satchel; on the ground, the top of the pile.
    const startX =
      p.airborne && fl
        ? this.x + (this.facing === 1 ? fl.tossOrigin[0] : this.catW() - fl.tossOrigin[0]) - Math.round(rw / 2)
        : this.x + pileX + Math.round((this.m.pile.width - rw) / 2);
    p.rolls.forEach((r, i) => {
      const flying = elapsed - i * t.staggerMs;
      if (flying < 0 || flying >= t.flightMs) return;
      const fromLayers = i === 0 ? p.layers : p.plan[i - 1];
      const startY =
        p.airborne && fl
          ? this.stripH - this.size(stand)[1] - fl.altitudePx + lift + fl.tossOrigin[1] - Math.round(rh / 2)
          : this.stripH - pileHeight(this.m, fromLayers) - rh;
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
