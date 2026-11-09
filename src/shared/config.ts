// Working title. The final name is undecided; change it here only.
export const APP_NAME = "NewsCat";

// Integer pixel-art scale (CSS px per art px). Never non-integer.
export const SPRITE_SCALE = 1;

// Overlay strip height in art px: the tallest moment is a 5-layer pile (42) under a
// loafing cat (42, overlapping 1) with z's rising ~24 above the head. Engine tests
// check nothing leaves this strip.
export const STRIP_ART_HEIGHT = 110;
export const OVERLAY_HEIGHT = STRIP_ART_HEIGHT * SPRITE_SCALE;

// Newer copies of the curated source list are published here. Fetched at most once
// a day; the copy bundled in the app is the fallback. Empty string turns it off.
export const SOURCES_REMOTE_URL = "https://raw.githubusercontent.com/rachelkph/news-sprite/main/data/sources.json";
