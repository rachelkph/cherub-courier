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
1. Gather items from all enabled sources within the age window (48h; items dated more than 1h in the future are dropped).
2. Skip items already delivered in an earlier edition (remembered 7 days), so the evening edition never repeats the morning's.
3. Drop duplicates, keeping the newest: same normalized URL (tracking parameters, www, fragment, trailing slash ignored), or headlines that are near-identical (word-set Jaccard >= 0.8) or the same story reworded (>= 5 shared words covering >= 75% of the shorter headline). Stopwords ignored; headlines under 4 words must match exactly. Thresholds and examples are tested in `test/feeds.test.ts`.
4. Keywords **boost, they do not filter**: within a topic, headlines containing a keyword (whole word, case-insensitive) come first. A topic is never emptied because nothing matched. (Decided by Claude 2026-11-08; Rachel to confirm.)
5. Fill the edition: first the best headline of each topic (topics with the newest headlines first), so a quiet topic is not crowded out; then the newest remaining, never more than 3 per topic, up to 7 total. (This is how "take at most 3 per topic, then fill to 7" is interpreted; Rachel to confirm.)
6. Store only: headline, source name, link, published time, topic, paywall flag.

## Feed fetching
Honest User-Agent; conditional GET; 15 s timeout; 5 MB cap; at most 200 entries per feed; one request at a time per host with 2 s spacing, 4 hosts in parallel; a feed is not refetched within 30 min, even on Refresh; errors back off from 15 min doubling to 24 h, honoring Retry-After; 404/410 marks a feed "gone" and waits 24 h. http feeds try https first. Redirects are followed manually (max 5) and every hop, including its resolved IP, must be public.

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
Chosen layout: "Option 1 — topic sections" in the mockup https://claude.ai/artifact/RPvxYiLrPD37X7wAsX55fb (private), decided 2026-11-08.
- Anchored above the cat, kept on screen near edges, aware of the Dock position. About 380 pt wide; the list scrolls past ~430 pt.
- Masthead named after the scheduled edition being shown, not the refresh time: first daily edition = "The Morning Edition", second = "The Evening Edition" (a manual refresh or late catch-up keeps the edition's name; only "Fetched <time>" changes). Under it: date and count of new headlines. No mood line.
- Topic chips under the masthead: All plus one per enabled topic (short label + icon). All shows every section; a topic chip filters to that section. Empty filter shows "Nothing new in <topic> tonight." The chosen chip is remembered.
- List: one section per topic, in settings order, headed by icon + topic name + count (bold small caps). Rows under a heading have no per-row topic label: headline (serif, max 2 lines) and source. Unread items carried over from earlier editions (up to 48h) sit inside their topic after the new ones, marked "· this morning" (or the edition they came from). No age on new items.
- At most 7 headlines per edition (max 3 per topic), as in Headline selection.
- Opened headlines dim. Clicking the cat marks the pile read (paper toss empties it); the popover still lists the headlines. Click a headline: open the original link in the default browser. No in-app summary.
- Footer: "Fetched <time>", Refresh, Settings. ("Mark all read" dropped 2026-11-08: clicking the cat already marks the pile read.)
- Look: newspaper clipping matching the sprite palette (cream paper, ink border with stepped pixel corners, stepped tail to the cat); pixel-font masthead (Silkscreen, OFL, bundled), macOS serif headlines, light and dark. Icons: hand-made 5x5 pixel icons at 2px per pixel in the text color, only on topic chips, section headings and footer buttons; no icon library.
- Paywalled sources get a small "paywall" tag.
- Superseded 2026-11-08: the Edition/Topic "Group by" switch and per-row topic labels.

## Settings
Edition times, topics, keywords, sources (add/remove/test a feed), launch at login, snooze, reset.

## Out of scope for v1
Accounts, sync, analytics, AI summaries or ranking, keyword-to-feed discovery, multiple displays, other languages, auto-update, in-app article reading, Windows/Linux.

## Non-goals / constraints to remember
Never store article text or images. Never claim a source is "unbiased". Never pre-select paywalled or terms-restricted sources (e.g. NYT).
