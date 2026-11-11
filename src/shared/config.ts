// The app's name (Rachel's pick, 2026-11-11; was the working title "NewsCat").
export const APP_NAME = "Cherub Courier";


// Who delivers the news. Each has a manifest.json in assets/<dir> (the cat's art
// sits at the top of assets/). stripArtHeight: the overlay strip's height in art px,
// fitting the tallest moment; engine tests check nothing leaves the strip.
// - cat: a 5-layer pile (42) under a loafing cat (42, overlapping 1), z's ~24 above.
// - cherub: a 5-layer pile under the resting cherub (99, overlapping 3), z's above.
export type CharacterId = "cherub" | "cat";
// scale: screen points per art pixel. 1 keeps pixels crisp; the cherub's art is
// drawn larger than the cat's, so he is shown at 2/3 (smoothed, snapped to whole
// device pixels; 0.5 would be crisp on Retina but smaller than the cat).
// paper: the newspaper's name on the popover's nameplate (Rachel's picks, 2026-11-10).
export type Character = { label: string; noun: string; paper: string; dir: string; stripArtHeight: number; scale: number; icon: string };
export const CHARACTERS: Record<CharacterId, Character> = {
  cherub: { label: "Cherub", noun: "cherub", paper: "The Cloud Nine Chronicle", dir: "cherub/", stripArtHeight: 160, scale: 2 / 3, icon: "hover_light/hover_light_0.png" },
  cat: { label: "Cat", noun: "cat", paper: "The Mewsletter", dir: "", stripArtHeight: 110, scale: 1, icon: "walk/walk_0.png" },
};
export const DEFAULT_CHARACTER: CharacterId = "cherub";
export const isCharacterId = (v: unknown): v is CharacterId => typeof v === "string" && Object.hasOwn(CHARACTERS, v);
export const overlayHeight = (c: CharacterId) => Math.ceil(CHARACTERS[c].stripArtHeight * CHARACTERS[c].scale);

// Newer copies of the curated source list are published here. Fetched at most once
// a day; the copy bundled in the app is the fallback. Empty string turns it off.
export const SOURCES_REMOTE_URL = "https://raw.githubusercontent.com/rachelkph/news-sprite/main/data/sources.json";
