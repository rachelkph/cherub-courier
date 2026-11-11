// The app's name (Rachel's pick, 2026-11-11; was the working title "NewsCat").
export const APP_NAME = "Cherub Courier";


// The cherub delivers the news (the cat was removed, Rachel, 2026-11-11). His art and
// manifest.json are in assets/cherub/. stripArtHeight: the overlay strip's height in
// art px, fitting the tallest moment (a 5-layer pile under him resting, z's above);
// engine tests check nothing leaves the strip.
// scale: screen points per art pixel. His art is drawn large, so he is shown at 2/3
// (smoothed, snapped to whole device pixels).
// paper: the newspaper's name on the popover's nameplate (Rachel's pick, 2026-11-10).
export const CHARACTER = {
  noun: "cherub",
  paper: "The Cloud Nine Chronicle",
  dir: "cherub/",
  stripArtHeight: 160,
  scale: 2 / 3,
  icon: "hover_light/hover_light_0.png",
} as const;
export const OVERLAY_HEIGHT = Math.ceil(CHARACTER.stripArtHeight * CHARACTER.scale);

// Newer copies of the curated source list are published here. Fetched at most once
// a day; the copy bundled in the app is the fallback. Empty string turns it off.
export const SOURCES_REMOTE_URL = "https://raw.githubusercontent.com/rachelkph/news-sprite/main/data/sources.json";
