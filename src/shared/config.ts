// Working title. The final name is undecided; change it here only.
export const APP_NAME = "NewsCat";

// Integer pixel-art scale (CSS px per art px). Never non-integer.
export const SPRITE_SCALE = 1;

// Who delivers the news. Each has a manifest.json in assets/<dir> (the cat's art
// sits at the top of assets/). stripArtHeight: the overlay strip's height in art px,
// fitting the tallest moment; engine tests check nothing leaves the strip.
// - cat: a 5-layer pile (42) under a loafing cat (42, overlapping 1), z's ~24 above.
// - cherub: a 5-layer pile under the resting cherub (99, overlapping 3), z's above.
export type CharacterId = "cherub" | "cat";
export type Character = { label: string; noun: string; dir: string; stripArtHeight: number; icon: string };
export const CHARACTERS: Record<CharacterId, Character> = {
  cherub: { label: "Cherub", noun: "cherub", dir: "cherub/", stripArtHeight: 160, icon: "hover_light/hover_light_0.png" },
  cat: { label: "Cat", noun: "cat", dir: "", stripArtHeight: 110, icon: "walk/walk_0.png" },
};
export const DEFAULT_CHARACTER: CharacterId = "cherub";
export const isCharacterId = (v: unknown): v is CharacterId => typeof v === "string" && Object.hasOwn(CHARACTERS, v);
export const overlayHeight = (c: CharacterId) => CHARACTERS[c].stripArtHeight * SPRITE_SCALE;

// Newer copies of the curated source list are published here. Fetched at most once
// a day; the copy bundled in the app is the fallback. Empty string turns it off.
export const SOURCES_REMOTE_URL = "https://raw.githubusercontent.com/rachelkph/news-sprite/main/data/sources.json";
