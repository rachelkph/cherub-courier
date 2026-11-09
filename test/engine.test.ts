import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CatEngine, type Sizes, type Sprite } from "../src/renderer/engine/cat.ts";
import { type Manifest, parseManifest, spritePaths } from "../src/renderer/engine/manifest.ts";
import { catMode, pileHeight, pileLayers, stack } from "../src/renderer/engine/state.ts";
import { arc, loopIndex, nextAt, sequenceStep, tossPlan } from "../src/renderer/engine/timeline.ts";
import { blank, diffPixels, draw, readPng } from "./helpers/png.ts";

const ASSETS = join(import.meta.dirname, "..", "assets");
const rawManifest = JSON.parse(readFileSync(join(ASSETS, "manifest.json"), "utf8"));
const m: Manifest = parseManifest(rawManifest);
const png = (p: string) => readPng(join(ASSETS, p));
// Sprite art is not in git (see .gitignore); tests that need it skip without it.
const HAS_ART = spritePaths(m).every((p) => existsSync(join(ASSETS, p)));
const art = { skip: HAS_ART ? false : "sprite art not in this checkout (see README)" };
const sizes: Sizes = HAS_ART
  ? Object.fromEntries(
      spritePaths(m).map((p) => {
        const img = png(p);
        return [p, [img.width, img.height]];
      }),
    )
  : {};
const clone = () => structuredClone(rawManifest);

describe("manifest", () => {
  it("parses the shipped manifest and every sprite exists", art, () => {
    for (const p of spritePaths(m)) assert.ok(existsSync(join(ASSETS, p)), p);
  });

  it("declared state sizes match the sprite files", art, () => {
    for (const s of [m.states.walk, m.states.walk_nobag, m.states.loaf, m.states.sleep]) {
      for (const f of s.frames) assert.deepEqual(sizes[f], s.size, f);
    }
  });

  it("pile files match width and layer height", art, () => {
    m.pile.files.forEach((f, i) => {
      assert.deepEqual(sizes[f], [m.pile.width, pileHeight(m, i + 1)], f);
    });
  });

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
    for (const [unread, layers] of want) assert.equal(pileLayers(unread, m.pile.unreadToLayers), layers, `unread ${unread}`);
  });

  it("walks with nothing unread, loafs, then sleeps after more than 2 editions", () => {
    assert.equal(catMode({ unread: 0, editionAge: 5 }, 2), "walk");
    assert.equal(catMode({ unread: 3, editionAge: 0 }, 2), "loaf");
    assert.equal(catMode({ unread: 3, editionAge: 2 }, 2), "loaf");
    assert.equal(catMode({ unread: 3, editionAge: 3 }, 2), "sleep");
  });

  // The preview images are the artist's reference renders of cat-on-pile.
  for (const [kind, frame] of [["cat_on_pile", "loaf/loaf_idle_a.png"], ["sleep_on_pile", "sleep/sleep_0.png"]] as const) {
    for (let layers = 1; layers <= 5; layers++) {
      it(`composites ${frame} on pile ${layers} exactly like preview/${kind}_${layers}.png`, art, () => {
        const ref = png(`preview/${kind}_${layers}.png`);
        const out = blank(ref.width, ref.height);
        for (const p of stack(m, frame, m.states.loaf.size, layers, 1)) draw(out, png(p.sprite), p.x, p.y, p.flip);
        assert.equal(diffPixels(out, ref), 0);
      });
    }
  }
});

describe("timeline", () => {
  it("loops frames", () => {
    assert.equal(loopIndex(4, 140, 0), 0);
    assert.equal(loopIndex(4, 140, 139), 0);
    assert.equal(loopIndex(4, 140, 140), 1);
    assert.equal(loopIndex(4, 140, 560), 0);
  });

  it("steps through a sequence and ends", () => {
    const steps = m.sequences.wake_on_click.steps;
    assert.equal(sequenceStep(steps, 0)?.frame, "loaf/loaf_half_eyes.png");
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

describe("CatEngine", art, () => {
  const strip = { width: 400, height: 110 };
  const make = (rng = () => 0.5) => new CatEngine(m, sizes, strip, 0, rng);
  const cat = (sprites: Sprite[]) => sprites.filter((s) => s.hit && !s.sprite.startsWith("pile/")).at(-1) as Sprite;
  const bottom = (s: Sprite) => s.y + sizes[s.sprite][1];

  it("walks along the ground and stops while hovered", () => {
    const e = make();
    const a = cat(e.tick(0).sprites);
    assert.equal(bottom(a), strip.height);
    const b = cat(e.tick(700).sprites);
    assert.equal(b.x - a.x, Math.floor(700 / m.behavior.walkStepMs) * m.behavior.walkStepPx);
    assert.ok(b.sprite.startsWith("walk/"));
    e.setHovered(true);
    const c = cat(e.tick(1400).sprites);
    assert.equal(c.x, b.x);
  });

  it("turns around at the edge and flips", () => {
    const e = make();
    e.tick(0);
    const s = cat(e.tick(m.behavior.walkStepMs * (400 / m.behavior.walkStepPx)).sprites);
    assert.equal(s.flip, true);
    assert.ok(s.x >= 0 && s.x <= strip.width - 63);
  });

  it("every frame's bottom row has pixels (sprites sit on the baseline)", () => {
    for (const f of [...m.states.walk.frames, ...m.states.loaf.frames, ...m.states.sleep.frames]) {
      const img = png(f);
      let opaque = 0;
      for (let x = 0; x < img.width; x++) if (img.data[((img.height - 1) * img.width + x) * 4 + 3] > 0) opaque++;
      assert.ok(opaque > 0, f);
    }
  });

  it("loafs on the right pile with the stack on the ground", () => {
    const e = make();
    e.setInputs({ unread: 5, editionAge: 0 });
    const sprites = e.tick(100).sprites;
    const pile = sprites.find((s) => s.sprite.startsWith("pile/")) as Sprite;
    assert.equal(pile.sprite, "pile/pile_3.png");
    assert.equal(bottom(pile), strip.height);
    const c = cat(sprites);
    assert.ok(m.states.loaf.frames.includes(c.sprite));
    assert.equal(bottom(c), pile.y + m.pile.catOverlap);
  });

  it("blinks on schedule", () => {
    const e = make(() => 0); // extras fire at the start of their range
    e.setInputs({ unread: 1, editionAge: 0 });
    e.tick(0);
    assert.equal(cat(e.tick(3000).sprites).sprite, "loaf/loaf_blink.png");
    assert.ok(m.states.loaf.frames.includes(cat(e.tick(3200).sprites).sprite));
  });

  it("sleeps with floating z's that are not clickable", () => {
    const e = make();
    e.setInputs({ unread: 9, editionAge: 3 });
    const sprites = e.tick(500).sprites;
    assert.ok(m.states.sleep.frames.includes(cat(sprites).sprite));
    const zs = sprites.filter((s) => s.sprite.startsWith("fx/z_"));
    assert.equal(zs.length, m.states.sleep.zzz.count);
    for (const z of zs) {
      assert.equal(z.hit, false);
      assert.ok(z.y >= 0, "z stays inside the strip");
    }
  });

  it("click wakes, tosses the papers, empties the pile once, then walks", () => {
    const e = make();
    e.setInputs({ unread: 9, editionAge: 0 });
    e.tick(0);
    assert.equal(e.click(1000), "deliver");
    assert.equal(e.click(1001), "ignored");
    assert.equal(cat(e.tick(1000).sprites).sprite, "loaf/loaf_half_eyes.png");
    const hop = cat(e.tick(1200).sprites); // second step: lifted 5px
    const restY = cat(e.tick(1000).sprites).y;
    assert.equal(hop.y, restY - 5);

    const tossStart = 1000 + 510;
    const mid = e.tick(tossStart + 150).sprites;
    assert.ok(mid.some((s) => s.sprite === "fx/paper_roll.png" && !s.hit));
    assert.equal((mid.find((s) => s.sprite.startsWith("pile/")) as Sprite).sprite, "pile/pile_2.png"); // 5 -> 3 -> 2 layers

    const t = m.sequences.wake_on_click.paperToss;
    const end = tossStart + 2 * t.staggerMs + t.flightMs;
    const done = e.tick(end);
    assert.equal(done.delivered, true);
    assert.deepEqual(e.getInputs(), { unread: 0, editionAge: 0 });
    assert.ok(cat(done.sprites).sprite.startsWith("walk/"));
    assert.equal(e.tick(end + m.behavior.walkStepMs).delivered, false);
  });

  it("click with no pile is just a hop", () => {
    const e = make();
    e.tick(0);
    assert.equal(e.click(0), "hop");
    assert.equal(bottom(cat(e.tick(50).sprites)), strip.height - 3);
    assert.equal(bottom(cat(e.tick(200).sprites)), strip.height);
  });

  it("everything fits inside the strip at the tallest moment", () => {
    const e = make();
    e.setInputs({ unread: 12, editionAge: 0 });
    e.tick(0);
    e.click(0);
    for (let t = 0; t < 2000; t += 10) for (const s of e.tick(t).sprites) assert.ok(s.y >= 0, `${s.sprite} at ${t}ms`);
    e.setInputs({ unread: 12, editionAge: 3 });
    for (let t = 2000; t < 6000; t += 50) for (const s of e.tick(t).sprites) assert.ok(s.y >= 0, `${s.sprite} at ${t}ms`);
  });
});
