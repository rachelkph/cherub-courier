// Working title. The final name is undecided; change it here only.
export const APP_NAME = "NewsCat";

// Integer pixel-art scale (CSS px per art px). Never non-integer.
export const SPRITE_SCALE = 1;

// Overlay strip height in art px: the tallest moment is a 5-layer pile (42) under a
// loafing cat (42, overlapping 1) with z's rising ~24 above the head. Engine tests
// check nothing leaves this strip.
export const STRIP_ART_HEIGHT = 110;
export const OVERLAY_HEIGHT = STRIP_ART_HEIGHT * SPRITE_SCALE;
