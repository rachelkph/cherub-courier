// Which state the cat is in, and how the cat sits on the pile. Art pixels.

import type { Manifest } from "./manifest.ts";

// walk: nothing to deliver. carry: flying with the news (characters that fly, while
// the newest edition is unread). loaf: resting on the pile. sleep: long neglect.
// buried: up to the neck in the news (characters with a buried state, when a lot
// is unread, whatever its age).
export type Mode = "walk" | "carry" | "loaf" | "sleep" | "buried";

export type Inputs = {
  unread: number; // unread headlines in the pile
  editionAge: number; // editions since the oldest unread one was delivered (0 = latest)
};

export function pileLayers(unread: number, table: Manifest["pile"]["unreadToLayers"]): number {
  let layers = 0;
  for (const row of table) if (unread >= row.minUnread) layers = row.layers;
  return layers;
}

export function catMode(inputs: Inputs, sleepAfterEditions: number, restAfterEditions = 0, buriedAt = Number.POSITIVE_INFINITY): Mode {
  if (inputs.unread <= 0) return "walk";
  if (inputs.unread >= buriedAt) return "buried";
  if (inputs.editionAge < restAfterEditions) return "carry";
  return inputs.editionAge > sleepAfterEditions ? "sleep" : "loaf";
}

export function pileHeight(m: Manifest, layers: number): number {
  return layers <= 0 ? 0 : layers * m.pile.layerHeight + m.pile.basePad;
}

export type Placed = { sprite: string; x: number; y: number; flip: boolean };

// Cat on its pile, with the cat's box at (0, 0) and the ground at catH + pileH - overlap.
// Facing left mirrors the pile's offset inside the cat's width.
export function stack(m: Manifest, cat: string, catSize: [number, number], layers: number, facing: 1 | -1): Placed[] {
  const [catW, catH] = catSize;
  const out: Placed[] = [{ sprite: cat, x: 0, y: 0, flip: facing === -1 }];
  if (layers > 0) {
    const px = facing === 1 ? m.pile.offsetX : catW - m.pile.offsetX - m.pile.width;
    out.unshift({ sprite: m.pile.files[layers - 1], x: px, y: catH - m.pile.catOverlap, flip: false });
  }
  return out;
}
