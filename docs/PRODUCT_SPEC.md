# Product spec — NewsCat (working title)

## One-line pitch
A pixel-art news cat who delivers your twice-daily headlines — and gets comfier on a growing pile of newspapers the longer you ignore him.

## Platform and distribution
- macOS desktop app. Electron recommended (confirm in M0).
- Distributed as a signed and notarized DMG via GitHub Releases. Rachel already has an Apple Developer Program membership (paid). No auto-update in v1.
- Main display only. If the main display is disconnected or changes, the cat moves to the remaining/new main display.
- US English only for v1.

## Core decisions (made by Rachel)
| Area | Decision |
|---|---|
| Data | Everything on the user's computer. No server, no accounts, no tracking, no AI. |
| Topics | Fixed list of about 12 plus user-typed keywords (no AI). |
| Keywords | Filter/boost only within feeds the user already subscribes to. No keyword-to-feed discovery in v1. |
| Sources | Curated list plus user-pasted RSS or site links. |
| Learning | None. Settings only. Nothing tracked. |
| Freshness | Two editions per day: 8am and 6pm local, changeable in settings. |
| Selection | Newest first, **max 3 headlines per topic**, **7 headlines max** per edition (proposed default window: items from the last 48 hours). |
| Click | Small popover anchored above the cat. |
| Launch at login | Asked during setup, default on. |

## Edition scheduler
- Fetch at the two edition times in the Mac's local time zone. Recompute on time zone or daylight-saving change.
- **Catch-up:** if the Mac was asleep or the app was closed at an edition time, fetch when it wakes/launches and deliver that edition.
- Also fetch on launch if the last fetch was more than about 6 hours ago.
- Manual "Refresh" button inside the popover.
- Offline: keep the last edition, retry later with back-off, never show an error popup unprompted.

## Headline selection (no AI)
1. Gather items from all enabled sources within the age window.
2. Drop duplicates (same URL, or near-identical normalized headlines by word overlap; document the threshold and test it).
3. Apply user keywords as a filter/boost within a topic if any are set (document behavior; keep it simple).
4. Sort newest first. Take at most 3 per topic, then fill to 7 total with the newest remaining items (still max 3 per topic).
5. Store only: headline, source name, link, published time, topic.

## Cat states (assets in `assets/`)
| State | When | Sprites |
|---|---|---|
| Walk (with navy satchel) | Default when no unread edition | `walk/walk_0..3.png`, 140 ms/frame, flip horizontally to face left |
| Walk without bag | Optional, after delivering | `walk_nobag/` |
| Loaf idle on pile | Unread headlines exist | `loaf/loaf_idle_a/b.png`; occasional `loaf_blink`, `loaf_tail_flick` |
| Deep sleep | Unread for a long time (proposed: more than 2 editions old) | `sleep/sleep_0/1.png` plus floating `fx/z_*.png` |
| Wake on click | User clicks the cat | sequence in `assets/manifest.json` (`wake_on_click`) |
| Pile layers | Unread count | `pile/pile_1..5.png`: 1–2 unread = 1, 3–4 = 2, 5–6 = 3, 7–8 = 4, 9+ = 5 |
| Paper toss | When opening/clearing | `fx/paper_roll.png` |
- Walks along the bottom edge of the main display, above the Dock; compute the position from the display's usable area (Dock can be at the side, enlarged, or auto-hidden).
- Overlay window: transparent, borderless, always on top, click-through everywhere except the cat's own pixels. Visible on every normal desktop/Space; hidden over full-screen apps (decided 2026-11-08). Sits below the Dock's window level so a revealed or magnified Dock covers him.
- Dock icon: kept (decided 2026-11-08). Hiding it makes macOS show the cat over full-screen apps.
- Hide/snooze: menu bar icon with Snooze (1h / until tomorrow), Hide cat, Refresh, Settings, Quit.

## Popover (click the cat)
- Anchored above the cat, kept on screen near edges, aware of the Dock position.
- Header: edition masthead and headline count (no mood line; dropped 2026-11-08). Headline rows grouped by edition (newest first, at most 7 per edition, unread carried over up to 48h): topic label, headline, source name, age.
- Clicking the cat marks the pile read (paper toss empties it). Click a headline: open the original link in the default browser. No in-app summary.
- "Group by" switch in the header: **Edition** (default; sections per edition, newest first) or **Topic** (sections per topic in settings order, newest first; older-edition items labelled, e.g. "· this morning"). The choice is remembered in settings.
- Footer: Refresh, Settings. ("Mark all read" dropped 2026-11-08: clicking the cat already marks the pile read.)
- Look: newspaper clipping matching the sprite palette; pixel-font masthead (Silkscreen, OFL, bundled), macOS serif headlines, light and dark. Icons: hand-made 5x5 pixel icons at 2px per pixel in the text color, only on topic labels, edition headings (moon/sun) and footer buttons; no icon library. Mockup: https://claude.ai/artifact/RPvxYiLrPD37X7wAsX55fb (private).
- Paywalled sources get a small "paywall" tag.

## Settings
Edition times, topics, keywords, sources (add/remove/test a feed), launch at login, snooze, reset.

## Out of scope for v1
Accounts, sync, analytics, AI summaries or ranking, keyword-to-feed discovery, multiple displays, other languages, auto-update, in-app article reading, Windows/Linux.

## Non-goals / constraints to remember
Never store article text or images. Never claim a source is "unbiased". Never pre-select paywalled or terms-restricted sources (e.g. NYT).
