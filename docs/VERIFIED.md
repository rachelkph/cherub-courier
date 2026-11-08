# Verification log

Every check actually run, with date and result. Unchecked claims stay in OPEN_QUESTIONS.md.

## 2026-11-08 — Seed feed liveness (`node scripts/check-feeds.mjs`)
One GET per feed from Rachel's Mac, honest User-Agent, 500 ms between requests.
"OK" = HTTP 200, parses as RSS/Atom (regex check), >0 items, newest item <= 72h old.

| id | result | format | items | newest | ETag | Last-Modified | notes |
|---|---|---|---|---|---|---|---|
| bbc-news-world | OK | RSS | 27 | 0h | no | no | http redirects to https; https URL works directly |
| bbc-news-top | OK | RSS | 25 | 0h | no | no | |
| bbc-news-us-canada | OK | RSS | 29 | 18h | no | no | was "memory" URL; now verified. http -> https |
| npr-news | OK | RSS | 10 | 2h | no | no | was "memory" URL; now verified |
| pbs-newshour | OK | RSS | 20 | 0h | yes | yes | was "memory" URL; now verified |
| guardian-world | OK | RSS | 45 | 0h | yes | no | |
| nyt-home | OK | RSS | 13 | 1h | no | no | user opt-in only (unchanged) |
| nyt-world | OK | RSS | 56 | 0h | no | no | user opt-in only (unchanged) |
| reuters-google-news | OK | RSS | 100 | 1h | no | no | unofficial; terms still unchecked; off by default |
| ap-google-news | OK | RSS | 100 | 1h | no | no | unofficial; terms still unchecked; off by default |
| ars-technica-ai | OK | RSS | 20 | 49h | yes | yes | newest item already outside a 48h window |
| mit-tech-review-ai | OK | RSS | 10 | 57h | yes | yes | outside a 48h window |
| the-verge-ai | OK | Atom | 10 | 1h | yes | no | only Atom feed in the seed set |
| wired-ai | OK | RSS | 10 | 7h | no | no | |
| techcrunch-ai | OK | RSS | 20 | 21h | yes | yes | |
| openai-news | OK | RSS | 1368 | 59h | no | no | whole archive in one feed (large download every fetch, no conditional GET) |
| variety | OK | RSS | 10 | 0h | yes | yes | |
| deadline | OK | RSS | 12 | 0h | yes | yes | |
| indiewire | OK | RSS | 12 | 0h | yes | yes | |
| npr-music | OK | RSS | 10 | 21h | no | no | |
| billboard-news | OK | RSS | 10 | 15h | yes | yes | |
| pitchfork-best-albums | STALE | RSS | 30 | 110h | no | no | works, but low cadence; rarely inside a 48h window |
| rolling-stone-music | OK | RSS | 10 | 4h | yes | yes | |
| stereogum | OK | RSS | 40 | 1h | yes | no | redirects www -> apex |

Not checked here: feed terms of use, paywall status, item content quality, sustained availability.

## 2026-11-08 — M0 overlay spike (automated checks only)
Machine: MacBook built-in Retina (1470x956 pt, 2x), macOS 15.6, Electron 45.2.3, Dock at bottom, default size, not auto-hidden.

| check | result | how |
|---|---|---|
| Window placement above Dock | PASS | CGWindowList: overlay at y=699, h=198, bottom edge 897 pt = workArea bottom (screen 956, Dock ~59) |
| Always-on-top level | PASS | CGWindowList layer 1000 (screen-saver level) |
| Transparent, no frame/shadow | PASS | `screencapture -l` of overlay window alone: ~93% of pixels alpha 0, only sprite pixels opaque, no frame |
| Pixel-perfect 3x (later changed to 2x), no smoothing | PASS (visual) | window capture shows hard pixel edges |
| Walks and flips direction | PASS | two captures 1s apart: moving right, facing right; earlier capture moving left, facing left |
| Menu bar icon exists | PASS | CGWindowList: Electron window at layer 25 in menu bar |
| CPU while walking | ~5% of one core total (4 processes), RSS ~180-290 MB | `ps` %cpu sampled 3x over 15s |

Notes:
- npm 11 did not run Electron's postinstall; binary fetched with `node node_modules/electron/install.js`.
- Full-screen app, Spaces, click-through, Dock left/right/enlarged/auto-hide, and display changes NOT yet verified (need hands-on testing).
| Rachel: cat visible above Dock over apps | PASS | Rachel screenshot, 2026-11-08; 3x judged too big -> default 2x |
| 2x scale | PASS | overlay capture: sprite 125 pt wide (63 art px x 2), strip 140 pt high |
| 1x scale (Rachel: 2x still too big) | PASS | overlay capture: sprite ~62 pt wide, strip 82 pt high |
| Startup race: bounds push lost before renderer listener | FIXED | at 1x the cat never drew (renderer log: loaded, no bounds received); renderer now pulls bounds via invoke at startup |

## 2026-11-08 — M0 Dock positions (with Rachel's permission; settings backed up and restored)
Method: `defaults write com.apple.dock ...` + `killall Dock`, wait 5s, compare NSScreen.main.visibleFrame
(independent of Electron) with the overlay's window-server bounds. Coordinates: top-left origin, screen 1470x956 pt.

| Dock | usable area | overlay | result |
|---|---|---|---|
| bottom, default (before tests) | x 0, w 1470, bottom 897 | x 0, w 1470, bottom 897 | PASS |
| left | x 47, w 1423, bottom 956 | x 47, w 1423, bottom 956 | PASS |
| right | x 0, w 1423, bottom 956 | x 0, w 1423, bottom 956 | PASS |
| bottom, tilesize 128 | bottom 889 | bottom 889 | PASS (Dock barely grew: it already spans the full width) |
| bottom, magnification on | bottom 889 | bottom 889 | PASS for placement; magnified icons are NOT in the usable area, so on hover they overlap the cat |
| bottom, auto-hide | bottom 956 | bottom 956 | PASS for placement; the revealed Dock appears under the cat (overlay is above Dock level) |
| restored | bottom 889 | bottom 889 | prefs identical to backup (diff: timestamps/GUIDs only); usable bottom is 889 vs 897 before — Dock restart changed its own layout, cause not determined |

Every change fired Electron `display-metrics-changed` and the overlay re-placed itself within the 5s wait.

## 2026-11-08 — M0 hands-on checks (Rachel)
| check | result |
|---|---|
| Click-through: clicks reach apps behind the cat | PASS (Rachel) |
| Hover stops the cat; click makes him hop | PASS (Rachel) |
| Visible across multiple Spaces/desktops | PASS (Rachel) |
| Menu bar icon: Hide / Show / Quit | PASS (Rachel) |
| Over full-screen apps | Rachel does NOT want him there. Changed: no longer joins full-screen Spaces; level lowered from screen-saver (1000) to floating (3, below Dock 20). CGWindowList confirms layer 3. Needs Rachel re-test. |
