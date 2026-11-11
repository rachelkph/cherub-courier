// Typed view of a character's manifest.json (version 2): assets/manifest.json for
// the cat, assets/<character>/manifest.json for the others. parseManifest validates
// the fields the engine uses and throws with the path of the first bad field.
// Fields for flying characters (carry, hover, flight, wake_in_flight,
// restAfterEditions) are optional; the cat has none of them.

export type Size = [number, number];

export type LoopState = {
  frames: string[];
  frameMs: number;
  size: Size;
};

export type Extra = {
  name: string;
  frame: string;
  showMs: number;
  everyMs: [number, number];
};

export type Zzz = {
  frames: string[];
  origin: [number, number];
  riseMs: number;
  risePx: number;
  driftPx: number;
  count: number;
  stepMs: number; // z's move in steps this long, to limit redraws
};

// While carrying unread news (before landing on the pile): the loop for the load.
export type Carry = LoopState & { minUnread: number; stepMs?: number; shadow?: string };

export type Flight = {
  altitudePx: number; // height of the sprite box's bottom above the ground
  shadow: string; // shadow on the ground under him, when not carrying
  shadowCenterX: number; // art px from the sprite's left edge (facing right)
  tossOrigin: [number, number]; // where rolls leave the satchel in flight, facing right
  turnHoverMs: number; // hover this long when turning around
};

export type SequenceStep = { frame: string; ms: number; y: number };

// Buried up to the neck when this much is unread: the mound is drawn in front of
// him, his feet on the ground. wake: how he climbs out when clicked (y in art px);
// a step's mound (default: the mound) lets the heap settle as he rises, ending on
// the pile he then stands on. burst: loose pages that fly off as he breaks free.
export type BuriedStep = SequenceStep & { mound?: string };
export type Burst = { frames: string[]; count: number; startMs: number; flightMs: number; arcHeightPx: number; distancePx: [number, number] };
export type Buried = { minUnread: number; mound: string; moundOffsetX: number; wake: BuriedStep[]; burst?: Burst };

export type PaperToss = {
  frame: string;
  maxRolls: number;
  staggerMs: number;
  flightMs: number;
  arcHeightPx: number;
  distancePx: [number, number];
};

export type Manifest = {
  version: 2;
  states: {
    walk: LoopState;
    walk_nobag?: LoopState;
    carry?: Carry[]; // sorted by minUnread
    hover?: LoopState & { extras: Extra[] };
    loaf: LoopState & { extras: Extra[] };
    sleep: LoopState & { zzz: Zzz };
  };
  flight?: Flight;
  buried?: Buried;
  sequences: {
    wake_on_click: { steps: SequenceStep[]; paperToss: PaperToss };
    wake_in_flight?: { steps: SequenceStep[] };
  };
  pile: {
    files: string[];
    width: number;
    layerHeight: number;
    basePad: number;
    offsetX: number;
    catOverlap: number;
    unreadToLayers: { minUnread: number; layers: number }[];
  };
  behavior: {
    sleepAfterEditions: number;
    restAfterEditions: number; // 0: rest on the pile as soon as there is news
    walkStepPx: number;
    walkStepMs: number;
  };
};

type Obj = Record<string, unknown>;

function fail(path: string, want: string): never {
  throw new Error(`manifest: ${path} must be ${want}`);
}

function obj(v: unknown, path: string): Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) fail(path, "an object");
  return v as Obj;
}

function num(v: unknown, path: string, min = 0): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min) fail(path, `a number >= ${min}`);
  return v;
}

function int(v: unknown, path: string, min = 0): number {
  const n = num(v, path, min);
  if (!Number.isInteger(n)) fail(path, "an integer");
  return n;
}

// Sprite paths are relative to assets/ and may not escape it.
function spritePath(v: unknown, path: string): string {
  if (typeof v !== "string" || !/^[a-z0-9_]+\/[a-z0-9_]+\.png$/.test(v)) fail(path, "a sprite path like dir/name.png");
  return v;
}

function list<T>(v: unknown, path: string, item: (x: unknown, p: string) => T, minLen = 1): T[] {
  if (!Array.isArray(v) || v.length < minLen) fail(path, `an array with at least ${minLen} item(s)`);
  return v.map((x, i) => item(x, `${path}[${i}]`));
}

function pair(v: unknown, path: string, isInt = true): [number, number] {
  const xs = list(v, path, isInt ? (x, p) => int(x, p, -1000) : (x, p) => num(x, p), 2);
  if (xs.length !== 2) fail(path, "a pair");
  return [xs[0], xs[1]];
}

function range(v: unknown, path: string): [number, number] {
  const [lo, hi] = pair(v, path);
  if (lo < 0 || hi < lo) fail(path, "[min, max] with 0 <= min <= max");
  return [lo, hi];
}

function loop(v: unknown, path: string): LoopState {
  const o = obj(v, path);
  return {
    frames: list(o.frames, `${path}.frames`, spritePath),
    frameMs: num(o.frameMs, `${path}.frameMs`, 1),
    size: pair(o.size, `${path}.size`),
  };
}

function extras(v: unknown, path: string): Extra[] {
  return list(
    v,
    path,
    (x, p) => {
      const e = obj(x, p);
      if (typeof e.name !== "string") fail(`${p}.name`, "a string");
      return {
        name: e.name,
        frame: spritePath(e.frame, `${p}.frame`),
        showMs: num(e.showMs, `${p}.showMs`, 1),
        everyMs: range(e.everyMs, `${p}.everyMs`),
      };
    },
    0,
  );
}

function steps(v: unknown, path: string): SequenceStep[] {
  return list(v, path, (x, p) => {
    const s = obj(x, p);
    return { frame: spritePath(s.frame, `${p}.frame`), ms: num(s.ms, `${p}.ms`, 1), y: int(s.y, `${p}.y`, -100) };
  });
}

function flight(v: unknown): Flight {
  const f = obj(v, "flight");
  return {
    altitudePx: int(f.altitudePx, "flight.altitudePx"),
    shadow: spritePath(f.shadow, "flight.shadow"),
    shadowCenterX: int(f.shadowCenterX, "flight.shadowCenterX"),
    tossOrigin: pair(f.tossOrigin, "flight.tossOrigin"),
    turnHoverMs: num(f.turnHoverMs, "flight.turnHoverMs"),
  };
}

function buried(v: unknown): Buried {
  const b = obj(v, "buried");
  return {
    minUnread: int(b.minUnread, "buried.minUnread", 1),
    mound: spritePath(b.mound, "buried.mound"),
    moundOffsetX: int(b.moundOffsetX, "buried.moundOffsetX", -1000),
    wake: steps(b.wake, "buried.wake").map((st, i) => {
      const mound = obj(list(b.wake, "buried.wake", (x) => x)[i], `buried.wake[${i}]`).mound;
      return mound === undefined ? st : { ...st, mound: spritePath(mound, `buried.wake[${i}].mound`) };
    }),
    ...(b.burst === undefined ? {} : { burst: burst(b.burst) }),
  };
}

function burst(v: unknown): Burst {
  const o = obj(v, "buried.burst");
  return {
    frames: list(o.frames, "buried.burst.frames", (x, p) => spritePath(x, p)),
    count: int(o.count, "buried.burst.count", 1),
    startMs: num(o.startMs, "buried.burst.startMs"),
    flightMs: num(o.flightMs, "buried.burst.flightMs", 1),
    arcHeightPx: int(o.arcHeightPx, "buried.burst.arcHeightPx"),
    distancePx: range(o.distancePx, "buried.burst.distancePx"),
  };
}

function carry(v: unknown): Carry[] {
  const out = list(v, "states.carry", (x, p) => {
    const c = obj(x, p);
    return {
      ...loop(c, p),
      minUnread: int(c.minUnread, `${p}.minUnread`, 1),
      ...(c.stepMs === undefined ? {} : { stepMs: num(c.stepMs, `${p}.stepMs`, 1) }),
      ...(c.shadow === undefined ? {} : { shadow: spritePath(c.shadow, `${p}.shadow`) }),
    };
  });
  for (let i = 1; i < out.length; i++) if (out[i].minUnread <= out[i - 1].minUnread) fail("states.carry", "sorted by minUnread");
  return out;
}

export function parseManifest(raw: unknown): Manifest {
  const root = obj(raw, "manifest");
  if (root.version !== 2) fail("version", "2");
  const states = obj(root.states, "states");

  const loafRaw = obj(states.loaf, "states.loaf");
  const loaf = { ...loop(loafRaw, "states.loaf"), extras: extras(loafRaw.extras, "states.loaf.extras") };
  const hoverRaw = states.hover === undefined ? undefined : obj(states.hover, "states.hover");

  const sleepRaw = obj(states.sleep, "states.sleep");
  const z = obj(sleepRaw.zzz, "states.sleep.zzz");
  const sleep = {
    ...loop(sleepRaw, "states.sleep"),
    zzz: {
      frames: list(z.frames, "states.sleep.zzz.frames", spritePath),
      origin: pair(z.origin, "states.sleep.zzz.origin"),
      riseMs: num(z.riseMs, "states.sleep.zzz.riseMs", 1),
      risePx: int(z.risePx, "states.sleep.zzz.risePx"),
      driftPx: int(z.driftPx, "states.sleep.zzz.driftPx", -100),
      count: int(z.count, "states.sleep.zzz.count", 1),
      stepMs: num(z.stepMs, "states.sleep.zzz.stepMs", 1),
    },
  };

  const sequences = obj(root.sequences, "sequences");
  const wake = obj(sequences.wake_on_click, "sequences.wake_on_click");
  const toss = obj(wake.paperToss, "sequences.wake_on_click.paperToss");
  const tp = "sequences.wake_on_click.paperToss";

  const pile = obj(root.pile, "pile");
  const table = list(pile.unreadToLayers, "pile.unreadToLayers", (x, p) => {
    const r = obj(x, p);
    return { minUnread: int(r.minUnread, `${p}.minUnread`, 1), layers: int(r.layers, `${p}.layers`, 1) };
  });
  const files = list(pile.files, "pile.files", spritePath);
  for (let i = 1; i < table.length; i++) {
    if (table[i].minUnread <= table[i - 1].minUnread) fail("pile.unreadToLayers", "sorted by minUnread");
  }
  for (const r of table) if (r.layers > files.length) fail("pile.unreadToLayers", `<= ${files.length} layers`);

  const behavior = obj(root.behavior, "behavior");

  return {
    version: 2,
    states: {
      walk: loop(states.walk, "states.walk"),
      ...(states.walk_nobag === undefined ? {} : { walk_nobag: loop(states.walk_nobag, "states.walk_nobag") }),
      ...(states.carry === undefined ? {} : { carry: carry(states.carry) }),
      ...(hoverRaw === undefined ? {} : { hover: { ...loop(hoverRaw, "states.hover"), extras: extras(hoverRaw.extras, "states.hover.extras") } }),
      loaf,
      sleep,
    },
    ...(root.flight === undefined ? {} : { flight: flight(root.flight) }),
    ...(root.buried === undefined ? {} : { buried: buried(root.buried) }),
    sequences: {
      ...(sequences.wake_in_flight === undefined
        ? {}
        : { wake_in_flight: { steps: steps(obj(sequences.wake_in_flight, "sequences.wake_in_flight").steps, "sequences.wake_in_flight.steps") } }),
      wake_on_click: {
        steps: steps(wake.steps, "sequences.wake_on_click.steps"),
        paperToss: {
          frame: spritePath(toss.frame, `${tp}.frame`),
          maxRolls: int(toss.maxRolls, `${tp}.maxRolls`, 1),
          staggerMs: num(toss.staggerMs, `${tp}.staggerMs`),
          flightMs: num(toss.flightMs, `${tp}.flightMs`, 1),
          arcHeightPx: int(toss.arcHeightPx, `${tp}.arcHeightPx`),
          distancePx: range(toss.distancePx, `${tp}.distancePx`),
        },
      },
    },
    pile: {
      files,
      width: int(pile.width, "pile.width", 1),
      layerHeight: int(pile.layerHeight, "pile.layerHeight", 1),
      basePad: int(pile.basePad, "pile.basePad"),
      offsetX: int(pile.offsetX, "pile.offsetX"),
      catOverlap: int(pile.catOverlap, "pile.catOverlap"),
      unreadToLayers: table,
    },
    behavior: {
      sleepAfterEditions: int(behavior.sleepAfterEditions, "behavior.sleepAfterEditions"),
      restAfterEditions: behavior.restAfterEditions === undefined ? 0 : int(behavior.restAfterEditions, "behavior.restAfterEditions"),
      walkStepPx: int(behavior.walkStepPx, "behavior.walkStepPx", 1),
      walkStepMs: num(behavior.walkStepMs, "behavior.walkStepMs", 1),
    },
  };
}

// Every sprite path the manifest references, for preloading.
export function spritePaths(m: Manifest): string[] {
  const s = m.states;
  const w = m.sequences.wake_on_click;
  return [
    ...new Set([
      ...s.walk.frames,
      ...(s.walk_nobag?.frames ?? []),
      ...(s.carry ?? []).flatMap((c) => [...c.frames, ...(c.shadow ? [c.shadow] : [])]),
      ...(s.hover ? [...s.hover.frames, ...s.hover.extras.map((e) => e.frame)] : []),
      ...s.loaf.frames,
      ...s.loaf.extras.map((e) => e.frame),
      ...s.sleep.frames,
      ...s.sleep.zzz.frames,
      ...w.steps.map((x) => x.frame),
      ...(m.sequences.wake_in_flight?.steps.map((x) => x.frame) ?? []),
      ...(m.flight ? [m.flight.shadow] : []),
      ...(m.buried
        ? [m.buried.mound, ...m.buried.wake.flatMap((x) => [x.frame, ...(x.mound ? [x.mound] : [])]), ...(m.buried.burst?.frames ?? [])]
        : []),
      w.paperToss.frame,
      ...m.pile.files,
    ]),
  ];
}
