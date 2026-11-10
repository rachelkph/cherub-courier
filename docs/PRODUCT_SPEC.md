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
| Topics | Fixed list of about 12, plus any number of topics the user names (fed only by feeds they paste; decided 2026-11-08), plus user-typed keywords (no AI). |
| Keywords | Filter/boost only within feeds the user already subscribes to. No keyword-to-feed discovery in v1. |
| Sources | Curated list plus user-pasted RSS or site links. |
| Learning | None. Settings only. Nothing tracked. |
| Freshness | Two editions per day: 8am and 6pm local, changeable in settings. |
| Selection | Newest first, **max 3 headlines per topic**, **7 headlines** per edition, except that every subscribed topic with news always gets one (so more than 7 topics means more than 7 headlines) (proposed default window: items from the last 48 hours). |
| Click | Small popover anchored above the cat. |
| Launch at login | Asked during setup, default on. |

## Edition scheduler
- Fetch at the two edition times in the Mac's local time zone. Recompute on time zone or daylight-saving change.
- **Catch-up:** if the Mac was asleep or the app was closed at an edition time, fetch when it wakes/launches and deliver that edition.
- Also fetch on launch if the last fetch was more than about 6 hours ago.
- Manual "Refresh" button inside the popover.
- Offline: keep the last edition, retry later with back-off (5, 15, 30, 60 min; immediately on wake), never show an error popup unprompted. A run where every feed fails saves nothing, so it is retried instead of recorded as an empty edition.
- If the Mac sleeps through several editions, only the latest is delivered on wake.
- Re-checks at least every 15 minutes, so a time-zone change is followed within 15 minutes.
- Snooze: 1 hour, or until the next morning edition. Hides the cat; editions are still fetched and the pile is there when he returns. Saved across restarts.

## Headline selection (no AI)
1. Gather items from all enabled sources within the age window (48h; items dated more than 1h in the future are dropped).
2. Skip items already delivered in an earlier edition (remembered 7 days), so the evening edition never repeats the morning's. (Confirmed by Rachel 2026-11-08.) This applies to the cat's deliveries only: the popover's front page keeps showing earlier stories while they are still current (decided 2026-11-09).
3. Drop duplicates, keeping the newest: same normalized URL (tracking parameters, www, fragment, trailing slash ignored), or headlines that are near-identical (word-set Jaccard >= 0.8) or the same story reworded (>= 5 shared words covering >= 75% of the shorter headline). Stopwords ignored; headlines under 4 words must match exactly. Thresholds and examples are tested in `test/feeds.test.ts`.
4. Keywords **boost, they do not filter**: within a topic, headlines containing a keyword (whole word, case-insensitive) come first. A topic is never emptied because nothing matched. (Confirmed by Rachel 2026-11-08.)
5. Fill the edition: first the best headline of every topic that has news, even past 7, so no subscribed topic is crowded out (no limit on topics: Rachel, 2026-11-08); then the newest remaining, never more than 3 per topic, up to 7 total. Refresh also adds the best headline of any topic that has none in the edition yet.
6. Store only: headline, source name, link, published time, topic, paywall flag.

## Feed fetching
Honest User-Agent; conditional GET; 15 s timeout; 5 MB cap; at most 200 entries per feed; one request at a time per host with 2 s spacing, 4 hosts in parallel; a feed is not refetched within 30 min, even on Refresh (confirmed by Rachel 2026-11-08); errors back off from 15 min doubling to 24 h, honoring Retry-After; 404/410 marks a feed "gone" and waits 24 h. http feeds try https first. Redirects are followed manually (max 5) and every hop, including its resolved IP, must be public.

## Characters
Rachel's choice (2026-11-10): the **cherub** delivers the news by default; the **cat** stays as an option (menu bar → Character; saved in settings as `character`). Same engine, one manifest each. The cherub is shown at 2/3 size (his art is drawn bigger than the cat's; Rachel asked for smaller, 2026-11-10): 1 art px = 2/3 pt, smoothed and snapped to whole device pixels, so he is about the cat's height (66 pt vs 58). The cat stays at 1 pt per art px, crisp. The strip above the Dock is 160 art px (107 pt) for the cherub, 110 for the cat. Sizes in the table are art px.

### Cherub states (assets in `assets/cherub/`, Rachel's own art)
| State | When | Sprites |
|---|---|---|
| Fly light | Nothing unread | `fly_light/0..3`, 130 ms, 26 px up, small shadow on the ground |
| Carry, medium bag | Newest edition unread, 1–4 headlines | `fly_medium/0..3`, 110 ms, slower flight, medium shadow |
| Carry, heavy bag (tired) | Newest edition unread, 5+ | `fly_heavy/0..3`, 140 ms, slowest, large shadow |
| Hover | Hovered, popover open, or turning around (420 ms) with nothing unread | `hover_light/0..3` + `hover_blink` every 3–6 s |
| Rest on pile | An older edition is still unread (`restAfterEditions` 1) | `rest/rest_0`, blink `rest_1`, doze `rest_2`; pile art borrowed from the cat until a newspaper mound is drawn |
| Sleep on pile | More than 2 editions old | `sleep/0..1` + z's |
| Click in flight | Carrying | hover up 4 px (`wake_in_flight`), rolls drop from the satchel to the ground, then fly light |
| Click on pile | Resting/sleeping | `wake_on_click` from the art notes (rest_1 → hover → fly, rising 14 px), pile tossed as for the cat |

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
- **Front page (decided 2026-11-09, mockup https://claude.ai/artifact/4Yi1QqFKH46rv9oFv7C5YZ):** the popover shows what's top right now, not only the latest delivery. The cat's pile is what's new; the popover is the front page.
  - Stories: everything your approved sources' latest feeds list that was published in the last 24 hours (a rolling window: each story leaves 24 hours after it was published, or sooner if its publisher drops it from the feed), plus what the cat brought most recently, which stays for up to 48 hours even if dropped.
  - Same link, or nearly the same headline from another outlet, is one story; the row credits the others ("BBC News +1 more"). Several feeds from one website count as one outlet.
  - Per topic: ranked by your keywords first, then how many outlets carry the story, then the publisher's own order in its feed, then newest. The top 3 show, plus every NEW story (so a topic can briefly show more); up to 3 more behind "Show N more".
  - NEW tag (pixel font, boxed, green) on what the cat brought most recently: it shows when you click him and stays until his next delivery. NEW stories come first in their topic.
  - Older stories carry a note: the edition that delivered them ("last night"), or when they were published ("this afternoon"). Nothing on stories from the current edition.
- **Look: "Pixel Gazette" (mockup C2 in https://claude.ai/artifact/3ewcyjqGRVZVfFswxRA9gs, chosen 2026-11-09; the newspaper-shaped outlines were dropped).** Nameplate "The NewsCat Gazette" in the pixel font over a faint newsprint dot texture (header only, never behind headlines); under it, between a double rule: the edition and date ("Evening · Mon, Nov 9", named after the current scheduled edition, not the refresh time) and "N new · N stories". Headlines in the system sans, semibold 15 px; the top story in a serif (Libre Caslon Text, OFL, bundled). NEW is a solid green pixel-font tag at the start of the source line. Section headings: pixel icon + pixel-font label over a dotted rule. No mood line.
- **Top story (All view only):** the best NEW story (most outlets, then the user's topic order, then the publisher's order, then newest), else the best of the rest, in a bordered box with "Top story · <topic>". It moves out of its section, which moves its next story up from "Show more". "N stories" counts everything on the front page, the same in every view.
- Topic chips under the masthead: All plus one per enabled topic that has headlines in the popover (short label + icon; a user-named topic shows its full name and the generic dot icon); a topic with nothing in it gets no chip, so no chip leads to an empty list. All shows every section; a topic chip filters to that section. Empty filter shows "Nothing in <topic> right now." The chosen chip is remembered.
- List: one section per topic, in settings order, headed by icon + topic name + count (bold small caps). Rows under a heading have no per-row topic label: headline (serif, max 2 lines) and source.
- Opened headlines dim. Clicking the cat marks the pile read (paper toss empties it). Click a headline: open the original link in the default browser. No in-app summary.
- Footer: "Fetched <time>", Refresh, Settings. Refresh re-checks the feeds (each at most every 30 min) and adds new headlines to the cat's current edition up to its limits; the front page is rebuilt from the refreshed feeds. Settings opens the setup window until a separate Settings screen exists.
- Closes on Esc or when clicking anywhere else. Clicking the cat toggles it: open, then closed on the next click. The cat stands still while it is open. ("Mark all read" dropped 2026-11-08: clicking the cat already marks the pile read.)
- Frame: cream paper, ink border with stepped pixel corners, stepped tail to the cat; light and dark. Icons: hand-made 5x5 pixel icons at 2px per pixel in the text color, only on topic chips, section headings and footer buttons; no icon library.
- Paywalled sources get a small "paywall" tag.
- Superseded 2026-11-08: the Edition/Topic "Group by" switch and per-row topic labels.

## Settings
Edition times, topics, keywords, sources (add/remove/test a feed), launch at login, snooze, character (cherub or cat), reset.

## Out of scope for v1
Accounts, sync, analytics, AI summaries or ranking, keyword-to-feed discovery, multiple displays, other languages, auto-update, in-app article reading, Windows/Linux.

## Non-goals / constraints to remember
Never store article text or images. Never claim a source is "unbiased". Never pre-select paywalled or terms-restricted sources (e.g. NYT).
