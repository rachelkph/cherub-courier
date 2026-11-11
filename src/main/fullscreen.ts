import { execFile } from "node:child_process";

// Is another app full screen on the main display?
// With no Dock icon (an accessory app), macOS shows our all-Spaces windows over
// full-screen apps even with visibleOnFullScreen: false (tested 2026-11-08), so the
// app hides the cherub itself. macOS has no public "is this Space full screen" call,
// so we ask the window server for on-screen windows. Two signs, both required
// (measured on a notched MacBook, 2026-11-11):
// - another app has a normal-level window spanning the display's width from the top
//   bar to the bottom edge (on a notched screen it starts below the notch, y = 33,
//   so it cannot be told from a filled window by its bounds alone);
// - the Dock's window is gone (it is on screen in ordinary Spaces, absent in
//   full-screen ones).
// Checked when the active Space changes, not polled.

export type WindowInfo = { pid: number; owner: string; layer: number; x: number; y: number; width: number; height: number };
export type Rect = { x: number; y: number; width: number; height: number };

const DOCK_LAYER = 20;
const TOP_BAR_MAX = 40; // menu bar or notch height, in points

export function otherAppFullScreen(windows: WindowInfo[], display: Rect, ownPid: number): boolean {
  if (windows.some((w) => w.owner === "Dock" && w.layer === DOCK_LAYER)) return false;
  return windows.some(
    (w) =>
      w.layer === 0 &&
      w.pid !== ownPid &&
      w.x === display.x &&
      w.width === display.width &&
      w.y >= display.y &&
      w.y <= display.y + TOP_BAR_MAX &&
      w.y + w.height === display.y + display.height,
  );
}

// JavaScript for Automation: the system's own osascript, no extra binary to sign.
// Bounds, owner names and PIDs need no Screen Recording permission (only titles do).
const LIST_WINDOWS = `
ObjC.import("CoreGraphics");
const list = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(
  $.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements, $.kCGNullWindowID)));
JSON.stringify((list || []).map((w) => ({ pid: w.kCGWindowOwnerPID, owner: w.kCGWindowOwnerName || "", layer: w.kCGWindowLayer,
  x: w.kCGWindowBounds.X, y: w.kCGWindowBounds.Y, width: w.kCGWindowBounds.Width, height: w.kCGWindowBounds.Height })));
`;

export function listWindows(): Promise<WindowInfo[]> {
  return new Promise((resolve) => {
    execFile("/usr/bin/osascript", ["-l", "JavaScript", "-e", LIST_WINDOWS], { timeout: 5000 }, (err, stdout) => {
      if (err) {
        console.log("[fullscreen] window list failed:", err.message);
        return resolve([]); // unknown: treat as not full screen, so the cherub stays reachable
      }
      try {
        const parsed: unknown = JSON.parse(stdout);
        resolve(Array.isArray(parsed) ? (parsed as WindowInfo[]) : []);
      } catch {
        resolve([]);
      }
    });
  });
}
