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
| Full-screen hiding, first attempt | FAIL (Rachel: still visible over full-screen Chrome). Reproduced with a throwaway full-screen Electron app + CGWindowList. |
| Root cause | `app.dock.hide()` (accessory app). Variants: fullscreenable=true -> still visible; Dock icon kept -> hidden; both -> hidden. |
| Full-screen hiding, fixed (Dock icon kept) | PASS (automated): on screen before, NOT on screen while other app full screen, back after. Needs Rachel re-test with Chrome. |
| Full-screen hiding, Rachel re-test with Chrome | PASS (Rachel). Decision: keep the Dock icon. |

## 2026-11-08 — M0 display changes (with Rachel's permission; session-only mode change, restored)
Switched the main display's HiDPI mode with CGConfigureDisplayWithDisplayMode(.forSession), waited 5s each.

| mode (pt) | usable area | overlay | result |
|---|---|---|---|
| 1470x956 (start) | w 1470, bottom 891 | w 1470, bottom 891 | PASS |
| 1710x1112 | w 1710, bottom 1042 | w 1710, bottom 1042 | PASS |
| 1280x832 | w 1280, bottom 775 | w 1280, bottom 775 | PASS |
| 1470x956 (restored) | w 1470, bottom 891 | w 1470, bottom 891 | PASS; cat still drawn (overlay capture) |

Not tested: physically plugging/unplugging an external display (no second display available in this session).

## 2026-11-08 — M1 cat engine
`npm test`: 32 tests pass (manifest validation, unread->pile mapping, walk/loaf/sleep rules, timelines,
toss plan, CatEngine with a fake clock). `npm run lint` (Biome + tsc) clean; Biome confirmed to flag a probe file.

| check | result | how |
|---|---|---|
| Cat-on-pile layout matches the artist's reference renders | PASS, 0 differing pixels | test composites loaf_idle_a / sleep_0 on piles 1-5 and diffs against preview/cat_on_pile_N.png and sleep_on_pile_N.png |
| Sprite sizes match manifest; pile = 56 wide, 8/layer + 2 | PASS | test reads PNG headers |
| Bottom row of every walk/loaf/sleep frame has pixels; stack bottom = strip bottom | PASS | tests + live captures (opaque bottom row = last row of the strip) |
| Nothing leaves the 110 art-px strip (5-layer pile + z's, wake hop, paper toss) | PASS | test sweeps 0-6s in each phase |
| Live: walk / loaf on pile 3 / sleep on pile 5 with z's | PASS (visual) | NEWSCAT_DEV_STATE + overlay window capture |
| Click: wake -> paper toss -> pile empties -> walk; delivered reported once | PASS (engine test); NOT yet seen live | needs Rachel to click |
| Dev menu (tray > Dev) sets unread / edition age | NOT verified live | needs Rachel |

CPU, % of one core, all 4 Electron processes, measured from cumulative CPU time over 20s (1x scale, Retina):

| state | before tuning | after |
|---|---|---|
| walk | 7.8-8.8% | 5.0% |
| loaf | 2.2% | 1.8% |
| sleep (z's) | 6.8% | 4.3% |

Findings: cost is per redraw, not per window area (300 pt-wide window: 8.4% vs 8.8% full width).
Tuning: adaptive tick cadence from the engine, dirty-rect redraw, walk moves 2 px per 140 ms frame
(was 1 px / 70 ms; same speed), z's move every 200 ms.
