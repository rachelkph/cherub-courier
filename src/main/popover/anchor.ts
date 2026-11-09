// Where the popover goes: above the cat, centered on him, kept inside the
// display's usable area (so it clears the menu bar and a side Dock), shrunk to
// fit if needed. The tail points at the cat even when the popover is pushed
// sideways at a screen edge. All values in screen points.

export type Rect = { x: number; y: number; width: number; height: number };

export const EDGE_MARGIN = 8;
export const GAP = 2; // between the tail tip and the cat
export const TAIL_INSET = 18; // the tail never sits closer than this to a corner
export const MIN_HEIGHT = 160;

export function anchorPopover(cat: Rect, want: { width: number; height: number }, work: Rect): { bounds: Rect; tailX: number } {
  const width = Math.min(want.width, work.width - 2 * EDGE_MARGIN);
  const center = cat.x + cat.width / 2;
  const minX = work.x + EDGE_MARGIN;
  const maxX = work.x + work.width - EDGE_MARGIN - width;
  const x = Math.round(Math.min(Math.max(center - width / 2, minX), maxX));

  const bottom = Math.min(cat.y - GAP, work.y + work.height);
  const room = bottom - (work.y + EDGE_MARGIN);
  const height = Math.round(Math.max(Math.min(want.height, room), Math.min(MIN_HEIGHT, room)));
  const y = Math.round(bottom - height);

  const tailX = Math.round(Math.min(Math.max(center - x, TAIL_INSET), width - TAIL_INSET));
  return { bounds: { x, y, width, height }, tailX };
}
