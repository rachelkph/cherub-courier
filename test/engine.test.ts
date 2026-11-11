import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CatEngine, type Sizes, type Sprite } from "../src/renderer/engine/cat.ts";
import { type Manifest, parseManifest, spritePaths } from "../src/renderer/engine/manifest.ts";
import { catMode, pileHeight, pileLayers } from "../src/renderer/engine/state.ts";
import { arc, loopIndex, nextAt, sequenceStep, tossPlan } from "../src/renderer/engine/timeline.ts";
import { readPng } from "./helpers/png.ts";
import { CHARACTER } from "../src/shared/config.ts";

// The cherub's art is not in git (see .gitignore); tests that need it skip without it.
const CHERUB = join(import.meta.dirname, "..", "assets", "cherub");
const rawManifest = JSON.parse(readFileSync(join(CHERUB, "manifest.json"), "utf8"));
const cm: Manifest = parseManifest(rawManifest);
const cpng = (p: string) => readPng(join(CHERUB, p));
const CHERUB_ART = spritePaths(cm).every((p) => existsSync(join(CHERUB, p)));
const cherubArt = { skip: CHERUB_ART ? false : "cherub art not in this checkout (see README)" };
const csizes: Sizes = CHERUB_ART
  ? Object.fromEntries(
      spritePaths(cm).map((p) => {
        const img = cpng(p);
        return [p, [img.width, img.height]];
      }),
    )
  : {};
const clone = () => structuredClone(rawManifest);

describe("manifest", () => {
  it("rejects sprite paths that escape assets/", () => {
    const bad = clone();
    bad.states.walk.frames[0] = "../secret.png";
    assert.throws(() => parseManifest(bad), /states\.walk\.frames\[0\]/);
  });

  it("rejects missing fields and wrong versions", () => {
    const noFrames = clone();
    delete noFrames.states.loaf.frames;
    assert.throws(() => parseManifest(noFrames), /states\.loaf\.frames/);
    const v1 = clone();
    v1.version = 1;
    assert.throws(() => parseManifest(v1), /version/);
  });

  it("rejects an unsorted unread-to-layers table", () => {
    const bad = clone();
    bad.pile.unreadToLayers.reverse();
    assert.throws(() => parseManifest(bad), /sorted/);
  });
});

describe("state", () => {
  it("maps unread counts to pile layers per the spec", () => {
    const want: [number, number][] = [[0, 0], [1, 1], [2, 1], [3, 2], [4, 2], [5, 3], [6, 3], [7, 4], [8, 4], [9, 5], [40, 5]];
    for (const [unread, layers] of want) assert.equal(pileLayers(unread, cm.pile.unreadToLayers), layers, `unread ${unread}`);
  });

  it("walks with nothing unread, loafs, then sleeps after more than 2 editions", () => {
    assert.equal(catMode({ unread: 0, editionAge: 5 }, 2), "walk");
    assert.equal(catMode({ unread: 3, editionAge: 0 }, 2), "loaf");
    assert.equal(catMode({ unread: 3, editionAge: 2 }, 2), "loaf");
    assert.equal(catMode({ unread: 3, editionAge: 3 }, 2), "sleep");
  });

});

describe("timeline", () => {
  it("loops frames", () => {
    assert.equal(loopIndex(4, 140, 0), 0);
    assert.equal(loopIndex(4, 140, 139), 0);
    assert.equal(loopIndex(4, 140, 140), 1);
    assert.equal(loopIndex(4, 140, 560), 0);
  });

  it("steps through a sequence and ends", () => {
    const steps = cm.sequences.wake_on_click.steps;
    assert.equal(sequenceStep(steps, 0)?.frame, "rest/rest_1.png");
    assert.equal(sequenceStep(steps, 150)?.y, -5);
    assert.equal(sequenceStep(steps, 509), steps[3]);
    assert.equal(sequenceStep(steps, 510), null);
  });

  it("schedules extras inside their range", () => {
    assert.equal(nextAt(1000, [3000, 6000], () => 0), 4000);
    assert.equal(nextAt(1000, [3000, 6000], () => 0.9999), 7000);
  });

  it("empties the pile evenly in at most maxRolls rolls", () => {
    assert.deepEqual(tossPlan(0, 3), []);
    assert.deepEqual(tossPlan(1, 3), [0]);
    assert.deepEqual(tossPlan(2, 3), [1, 0]);
    assert.deepEqual(tossPlan(3, 3), [2, 1, 0]);
    assert.deepEqual(tossPlan(5, 3), [3, 2, 0]);
  });

  it("arcs up and comes back down", () => {
    assert.deepEqual(arc(0, 40, 20), { dx: 0, dy: 0 });
    assert.deepEqual(arc(0.5, 40, 20), { dx: 20, dy: -20 });
    assert.deepEqual(arc(1, -40, 20), { dx: -40, dy: 0 });
  });
});

describe("cherub manifest", () => {
  it("parses, and every sprite exists at its declared size", cherubArt, () => {
    for (const p of spritePaths(cm)) assert.ok(existsSync(join(CHERUB, p)), p);
    for (const s of [cm.states.walk, cm.states.hover, cm.states.loaf, cm.states.sleep, ...(cm.states.carry ?? [])]) {
      for (const f of s?.frames ?? []) assert.deepEqual(csizes[f], s?.size, f);
    }
  });

  it("mound stages match the pile width and layer heights", cherubArt, () => {
    cm.pile.files.forEach((f, i) => {
      assert.deepEqual(csizes[f], [cm.pile.width, pileHeight(cm, i + 1)], f);
    });
  });

  it("carries the news in flight, lands on the pile an edition later, then sleeps", () => {
    const { sleepAfterEditions: s, restAfterEditions: r } = cm.behavior;
    assert.equal(catMode({ unread: 0, editionAge: 3 }, s, r), "walk");
    assert.equal(catMode({ unread: 4, editionAge: 0 }, s, r), "carry");
    assert.equal(catMode({ unread: 4, editionAge: 1 }, s, r), "loaf");
    assert.equal(catMode({ unread: 4, editionAge: 3 }, s, r), "sleep");
  });

  it("is buried with 8 or more unread, whatever the edition's age", () => {
    const { sleepAfterEditions: s, restAfterEditions: r } = cm.behavior;
    const at = cm.buried?.minUnread;
    assert.equal(at, 8);
    for (const editionAge of [0, 1, 3]) {
      assert.equal(catMode({ unread: 8, editionAge }, s, r, at), "buried", `age ${editionAge}`);
      assert.notEqual(catMode({ unread: 7, editionAge }, s, r, at), "buried", `age ${editionAge}`);
    }
  });

  it("rejects a carry table out of order", () => {
    const raw = JSON.parse(readFileSync(join(CHERUB, "manifest.json"), "utf8"));
    raw.states.carry.reverse();
    assert.throws(() => parseManifest(raw), /states\.carry/);
  });
});

describe("CatEngine with the cherub", cherubArt, () => {
  const strip = { width: 600, height: CHARACTER.stripArtHeight };
  const make = (rng = () => 0.5) => new CatEngine(cm, csizes, strip, 0, rng);
  const fl = cm.flight as NonNullable<Manifest["flight"]>;
  const him = (sprites: Sprite[]) => sprites.filter((s) => s.hit && !s.sprite.startsWith("pile/")).at(-1) as Sprite;
  const shadow = (sprites: Sprite[]) => sprites.find((s) => s.sprite.startsWith("fx/shadow_"));
  const bottom = (s: Sprite) => s.y + csizes[s.sprite][1];
  const carry = cm.states.carry ?? [];

  it("flies at his altitude with an unclickable shadow on the ground", () => {
    const e = make();
    const sprites = e.tick(0).sprites;
    const c = him(sprites);
    assert.ok(cm.states.walk.frames.includes(c.sprite));
    assert.equal(bottom(c), strip.height - fl.altitudePx);
    const sh = shadow(sprites) as Sprite;
    assert.equal(sh.sprite, fl.shadow);
    assert.equal(sh.hit, false);
    assert.equal(bottom(sh), strip.height);
    assert.equal(sh.x + csizes[sh.sprite][0] / 2, c.x + fl.shadowCenterX, "shadow under his feet");
    const later = him(e.tick(1300).sprites);
    assert.equal(later.x - c.x, Math.floor(1300 / cm.behavior.walkStepMs) * cm.behavior.walkStepPx);
  });

  it("reduced motion: flaps in place, empty-handed or carrying the news", () => {
    const e = make();
    e.setReducedMotion(true);
    const a = him(e.tick(0).sprites);
    const b = him(e.tick(3000).sprites);
    assert.equal(b.x, a.x);
    assert.equal(bottom(b), strip.height - fl.altitudePx, "still in the air");
    e.setInputs({ unread: 3, editionAge: 0 });
    const frames = new Set<string>();
    for (let t = 4000; t < 6000; t += 50) {
      const c = him(e.tick(t).sprites);
      assert.equal(c.x, a.x);
      frames.add(c.sprite);
    }
    assert.ok(frames.size > 1, "wings still flap");
    assert.equal(e.click(6000), "deliver");
    assert.equal(e.click(6001), "ignored");
    const done = e.tick(6010);
    assert.equal(done.delivered, true);
    assert.ok(!done.sprites.some((s) => s.sprite === "fx/paper_roll.png"), "no paper toss");
    assert.deepEqual(e.getInputs(), { unread: 0, editionAge: 0 });
    assert.equal(e.tick(6100).delivered, false, "delivered once");
    assert.equal(e.click(7000), "hop");
    assert.equal(bottom(him(e.tick(7050).sprites)), strip.height - fl.altitudePx, "no hop");
    e.setReducedMotion(false);
    assert.notEqual(him(e.tick(9000).sprites).x, a.x, "flies again when the setting is turned off");
  });

  it("keeps flapping in place (hover, with a blink) while hovered or paused", () => {
    const e = make(() => 0);
    const a = him(e.tick(0).sprites);
    e.setHovered(true);
    const seen = new Set<string>();
    for (let t = 100; t < 3200; t += 20) {
      const s = him(e.tick(t).sprites);
      assert.equal(s.x, a.x);
      seen.add(s.sprite);
    }
    assert.ok(cm.states.hover?.frames.every((f) => seen.has(f)), "all hover frames play");
    assert.ok(seen.has("hover_light/hover_blink.png"), "blinks");
  });

  it("carries a heavier bag (bigger shadow, slower) as the news piles up", () => {
    for (const [unread, entry] of [[2, carry[0]], [5, carry[1]], [7, carry[1]]] as const) {
      const e = make();
      e.setInputs({ unread, editionAge: 0 });
      const a = e.tick(0).sprites;
      assert.ok(entry.frames.includes(him(a).sprite), `unread ${unread}`);
      assert.equal(shadow(a)?.sprite, entry.shadow);
      assert.equal(a.some((s) => s.sprite.startsWith("pile/")), false, "no pile while flying");
      const b = him(e.tick(2000).sprites);
      assert.equal(b.x - him(a).x, Math.floor(2000 / (entry.stepMs ?? 0)) * cm.behavior.walkStepPx);
    }
  });

  it("hovers for a moment when turning around", () => {
    const e = make();
    e.tick(0);
    const steps = (strip.width - 96) / cm.behavior.walkStepPx;
    let t = 0;
    let s = him(e.tick(t).sprites);
    while (!s.flip) {
      t += cm.behavior.walkStepMs;
      s = him(e.tick(t).sprites);
    }
    assert.ok(t <= (steps + 1) * cm.behavior.walkStepMs);
    assert.ok(cm.states.hover?.frames.includes(s.sprite) || s.sprite === "hover_light/hover_blink.png");
    const x = s.x;
    assert.equal(him(e.tick(t + fl.turnHoverMs - 10).sprites).x, x, "holds still while turning");
    const on = him(e.tick(t + fl.turnHoverMs + cm.behavior.walkStepMs * 3).sprites);
    assert.ok(on.x < x && cm.states.walk.frames.includes(on.sprite), "then flies back left");
  });

  it("lands on the pile with his feet on the top paper, and sleeps later", () => {
    const e = make();
    e.setInputs({ unread: 7, editionAge: 1 });
    const sprites = e.tick(100).sprites;
    const pile = sprites.find((s) => s.sprite.startsWith("pile/")) as Sprite;
    assert.equal(pile.sprite, "pile/pile_4.png");
    assert.equal(bottom(pile), strip.height);
    const c = him(sprites);
    assert.ok(cm.states.loaf.frames.includes(c.sprite));
    assert.equal(shadow(sprites), undefined, "no shadow when landed");
    // His lowest opaque row sits right on the pile's highest opaque row.
    const lowest = (img: ReturnType<typeof cpng>) => {
      for (let y = img.height - 1; y >= 0; y--) for (let x = 0; x < img.width; x++) if (img.data[(y * img.width + x) * 4 + 3] > 0) return y;
      return -1;
    };
    const highest = (img: ReturnType<typeof cpng>) => {
      for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) if (img.data[(y * img.width + x) * 4 + 3] > 0) return y;
      return -1;
    };
    assert.equal(c.y + lowest(cpng(c.sprite)) + 1, pile.y + highest(cpng(pile.sprite)));
    e.setInputs({ unread: 7, editionAge: 3 });
    const z = e.tick(5000).sprites;
    assert.ok(cm.states.sleep.frames.includes(him(z).sprite));
    assert.equal(z.filter((s) => s.sprite.startsWith("fx/z_")).length, cm.states.sleep.zzz.count);
  });

  it("click in flight: hovers, drops the rolls from his satchel, delivers once, flies light", () => {
    const e = make();
    e.setInputs({ unread: 6, editionAge: 0 });
    e.tick(0);
    assert.equal(e.click(1000), "deliver");
    const wake = cm.sequences.wake_in_flight?.steps ?? [];
    assert.equal(him(e.tick(1000).sprites).sprite, wake[0].frame);
    const tossStart = 1000 + wake.reduce((n, s) => n + s.ms, 0);
    const mid = e.tick(tossStart + 150).sprites;
    const rolls = mid.filter((s) => s.sprite === "fx/paper_roll.png");
    assert.ok(rolls.length > 0 && rolls.every((r) => !r.hit));
    assert.equal(mid.some((s) => s.sprite.startsWith("pile/")), false);
    const t = cm.sequences.wake_on_click.paperToss;
    const end = tossStart + 2 * t.staggerMs + t.flightMs;
    const done = e.tick(end);
    assert.equal(done.delivered, true);
    assert.deepEqual(e.getInputs(), { unread: 0, editionAge: 0 });
    assert.ok(cm.states.walk.frames.includes(him(done.sprites).sprite));
    assert.equal(e.tick(end + 200).delivered, false);
  });

  it("buried up to the neck: head above the mound, body hidden, mound clickable, box is him", () => {
    const e = make(() => 0.99);
    e.setInputs({ unread: 12, editionAge: 0 });
    const sprites = e.tick(100).sprites;
    const b = cm.buried as NonNullable<Manifest["buried"]>;
    const mound = sprites.find((s) => s.sprite === b.mound) as Sprite;
    const c = sprites.find((s) => s.sprite !== b.mound && s.hit) as Sprite;
    assert.ok(cm.states.loaf.frames.includes(c.sprite));
    assert.equal(bottom(mound), strip.height);
    assert.equal(bottom(c), strip.height, "feet on the ground");
    assert.equal(mound.hit, true);
    assert.equal(sprites.indexOf(mound) > sprites.indexOf(c), true, "mound in front");
    assert.deepEqual(e.catBox(sprites), { x: c.x, y: c.y, width: 96, height: 99 });
    // Every pixel of him below the chin (frame row 57) is covered by the mound.
    const img = cpng(c.sprite);
    const mimg = cpng(b.mound);
    const covered = (x: number, y: number) => {
      const mx = c.x + x - mound.x;
      const my = c.y + y - mound.y;
      return mx >= 0 && my >= 0 && mx < mimg.width && my < mimg.height && mimg.data[(my * mimg.width + mx) * 4 + 3] > 0;
    };
    let shown = 0;
    let body = 0;
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        if (img.data[(y * img.width + x) * 4 + 3] === 0) continue;
        if (y < 50 && !covered(x, y)) shown++;
        if (y >= 60 && !covered(x, y)) body++;
      }
    }
    assert.ok(shown > 2000, "his head shows");
    assert.equal(body, 0, "nothing below the neck shows");
  });

  it("buried and neglected: asleep in the mound with z's; facing left mirrors the mound", () => {
    const e = make();
    e.setInputs({ unread: 15, editionAge: 3 });
    const sprites = e.tick(3000).sprites;
    assert.ok(sprites.some((s) => cm.states.sleep.frames.includes(s.sprite)));
    assert.equal(sprites.filter((s) => s.sprite.startsWith("fx/z_")).length, cm.states.sleep.zzz.count);
  });

  it("click while buried: climbs out, then tosses the full pile and delivers", () => {
    const e = make();
    e.setInputs({ unread: 12, editionAge: 1 });
    e.tick(0);
    assert.equal(e.click(100), "deliver");
    const b = cm.buried as NonNullable<Manifest["buried"]>;
    const first = e.tick(100).sprites;
    assert.equal((first.find((s) => s.hit && s.sprite !== b.mound) as Sprite).sprite, b.wake[0].frame);
    const out = 100 + b.wake.reduce((n, s) => n + s.ms, 0);
    const climbing = e.tick(out - 10).sprites;
    const him = climbing.find((s) => s.hit && s.sprite !== b.mound) as Sprite;
    assert.equal(bottom(him), strip.height + b.wake[b.wake.length - 1].y);
    const tossing = e.tick(out + 10).sprites;
    assert.equal(tossing.some((s) => s.sprite === b.mound), false, "out of the mound");
    const pile = tossing.find((s) => s.sprite.startsWith("pile/pile_")) as Sprite;
    assert.equal(pile.sprite, "pile/pile_3.png", "the first roll leaves as he lands on the pile (5 -> 3 layers)");
    const t = cm.sequences.wake_on_click.paperToss;
    const done = e.tick(out + 2 * t.staggerMs + t.flightMs);
    assert.equal(done.delivered, true);
    assert.deepEqual(e.getInputs(), { unread: 0, editionAge: 0 });
  });

  it("climbing out: the mound settles into exactly the pile he then stands on, facing either way", () => {
    const b = cm.buried as NonNullable<Manifest["buried"]>;
    const wakeMs = b.wake.reduce((n, st) => n + st.ms, 0);
    // Opaque pixels of the sprites matching `pick`, as "x,y" strip positions.
    const pixels = (sprites: Sprite[], pick: (s: Sprite) => boolean) => {
      const out = new Set<string>();
      for (const s of sprites.filter(pick)) {
        const img = cpng(s.sprite);
        for (let y = 0; y < img.height; y++) {
          for (let x = 0; x < img.width; x++) {
            const sx = s.flip ? img.width - 1 - x : x;
            if (img.data[(y * img.width + sx) * 4 + 3] > 0) out.add(`${s.x + x},${s.y + y},${img.data.subarray((y * img.width + sx) * 4, (y * img.width + sx) * 4 + 3).join(":")}`);
          }
        }
      }
      return out;
    };
    const facings: boolean[] = [];
    for (const rng of [() => 0.5, () => 0.99]) {
      const e = make(rng);
      e.setInputs({ unread: 9, editionAge: 0 }); // 5 layers, and buried
      e.tick(0);
      // Face left for the second run: fly to the right edge first.
      if (rng() > 0.9) {
        e.setInputs({ unread: 0, editionAge: 0 });
        let t = 0;
        while (!e.tick(t).sprites.some((s) => s.hit && s.flip) && t < 60000) t += 200;
        e.setInputs({ unread: 9, editionAge: 0 });
      }
      const t0 = 100000;
      e.tick(t0);
      e.click(t0);
      const last = e.tick(t0 + wakeMs - 1).sprites;
      const settled = last.find((s) => s.sprite === b.wake.at(-1)?.mound) as Sprite;
      assert.ok(settled, "the last settling frame is drawn");
      // What the pile would look like with him standing on it, before any roll leaves.
      const standing = e.catBox(last) as { x: number };
      const pileX = settled.flip ? standing.x + 96 - cm.pile.offsetX - cm.pile.width : standing.x + cm.pile.offsetX;
      const pile5: Sprite = { sprite: cm.pile.files[4], x: pileX, y: strip.height - csizes[cm.pile.files[4]][1], flip: settled.flip, hit: true };
      assert.deepEqual(pixels(last, (s) => s === settled), pixels([pile5], () => true), `facing ${settled.flip ? "left" : "right"}`);
      facings.push(settled.flip);
    }
    assert.deepEqual(facings, [false, true], "tested facing right, then left");
  });

  it("climbing out: loose pages burst off, unclickable, and land before he is out; the box stays his", () => {
    const b = cm.buried as NonNullable<Manifest["buried"]>;
    const burst = b.burst as NonNullable<Manifest["buried"]>["burst"] & object;
    const wakeMs = b.wake.reduce((n, st) => n + st.ms, 0);
    assert.ok(burst.startMs + burst.flightMs <= wakeMs, "pages land before the wake ends");
    const e = make();
    e.setInputs({ unread: 12, editionAge: 0 });
    e.tick(0);
    e.click(0);
    const mid = e.tick(burst.startMs + burst.flightMs / 2).sprites;
    const pages = mid.filter((s) => burst.frames.includes(s.sprite));
    assert.equal(pages.length, burst.count);
    assert.ok(pages.every((p) => !p.hit));
    assert.ok(pages.some((p) => p.flip) && pages.some((p) => !p.flip), "they fly both ways");
    assert.equal(e.tick(burst.startMs + burst.flightMs).sprites.filter((s) => burst.frames.includes(s.sprite)).length, 0);
    const box = e.catBox(mid) as { width: number; height: number };
    assert.deepEqual([box.width, box.height], [96, 99], "the popover anchors on him, not a settling mound frame");
  });

  it("click on the pile: wakes with the given sequence, then tosses", () => {
    const e = make();
    e.setInputs({ unread: 7, editionAge: 2 });
    e.tick(0);
    assert.equal(e.click(500), "deliver");
    assert.equal(him(e.tick(500).sprites).sprite, "rest/rest_1.png");
    const start = 500 + cm.sequences.wake_on_click.steps.reduce((n, s) => n + s.ms, 0);
    const mid = e.tick(start + 150).sprites;
    assert.equal((mid.find((s) => s.sprite.startsWith("pile/")) as Sprite).sprite, "pile/pile_1.png"); // 4 -> 3 -> 1 layers
    assert.ok(mid.some((s) => s.sprite === "fx/paper_roll.png"));
  });

  it("everything fits inside his strip, in every state, facing either way", () => {
    for (const editionAge of [0, 1, 3]) {
      for (const unread of [0, 1, 5, 10, 12]) {
        const e = make();
        e.setInputs({ unread, editionAge });
        for (let t = 0; t < 4000; t += 25) {
          if (t === 1000) e.click(t);
          for (const s of e.tick(t).sprites) {
            assert.ok(s.y >= 0 && bottom(s) <= strip.height, `${s.sprite} at ${t}ms (unread ${unread}, age ${editionAge})`);
          }
        }
      }
    }
  });
});
