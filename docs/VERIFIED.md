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

## 2026-11-08 — M2 feed engine
`npm test`: 61 tests pass (29 new for feeds), `npm run lint` clean. Fixtures in `test/fixtures/`.

| acceptance item | result | how |
|---|---|---|
| RSS 2.0, RSS 1.0 (RDF), Atom parse | PASS | fixtures: CDATA, relative links, xml:base, guid permalinks, alternate vs enclosure links, published vs updated, EST/+0000/ISO dates |
| Malformed XML / HTML page / empty body do not crash | PASS | FeedParseError, recorded as that feed's error |
| HTML stripped, entities decoded, invisible/bidi characters removed, length capped | PASS | sanitize tests + fixture with entity-escaped `<script>` |
| DOCTYPE entities never expanded | PASS | billion-laughs fixture parses in <1s with no expansion |
| Unsafe links dropped: javascript:, data:, file:, credentials, localhost, private IPs, .local, bare hostnames, cloud metadata IP | PASS | sanitize + parse tests |
| Duplicates removed (URL normalization, near-identical, same story reworded) | PASS | threshold tests incl. a real BBC/NPR pair |
| Selection: newest first, max 3/topic, 7 total, topics with <3 items, 48h window, future dates, previously delivered excluded | PASS | selectEdition tests |
| Conditional GET (ETag / Last-Modified), 304 reuses cached entries | PASS | fake-network test |
| Back-off 15m doubling to 24h; Retry-After; 404/410 = gone for 24h; 30 min minimum refetch | PASS | fake-network tests |
| Redirects: manual, max 5, every hop + resolved IP must be public; only 301/308 remembered | PASS | fake-network tests |
| Size cap 5 MB (declared and streamed); 15 s timeout | PASS (size); timeout path covered by the network-error test only |
| Bad feed isolated from good feeds; 2 s spacing per host, 4 hosts in parallel | PASS | fetchAll test |
| Persist locally: atomic write, 0600, re-sanitized on load, corrupt file set aside | PASS | store test |
| Live: 15 recommended seed feeds -> edition | PASS | `node scripts/fetch-edition.ts`: 15/15 fetched, 7 headlines, 2.3-2.4 s |
| Live in the app: Dev > Fetch edition now -> state.json (0600) -> pile | PASS | NEWSCAT_DEV_FETCH=1: 7 headlines, 4-layer pile captured |

Found live, then fixed: the same Nvidia story from BBC and NPR, reworded, passed the near-identical rule (Jaccard 0.64). Added the "same story" rule (>= 5 shared words covering >= 75% of the shorter headline).

Not verified: behavior behind a proxy (Node's fetch ignores macOS proxy settings); timeout against a real slow server.

## 2026-11-08 — M3 sources and onboarding
`npm test`: 88 tests pass (27 new: sources schema, remote loader, link checking/discovery, settings, setup validation). Lint clean.
Live checks drove the real setup window through Chromium's DevTools protocol (localhost-only debug port), with real network for feeds.

| acceptance item | result | how |
|---|---|---|
| Skipping setup leaves a working app | PASS | Skip -> settings onboarded, default topics, **no sources**, nothing fetched (no state.json written); cat keeps walking. Rachel's decision 2026-11-08. |
| Recommended list requires explicit approval | PASS | nothing fetched until "Approve these sources" -> Finish; then 13 sources -> 7 headlines -> pile |
| Pasted RSS / site link works | PASS | `stereogum.com` -> discovered https://stereogum.com/feed, latest headline shown, added under Music, saved |
| Site without a feed shows the friendly message | PASS | `https://example.com` -> "We couldn't find a feed for this site."; tests confirm links in page bodies are not followed |
| Local/private addresses rejected | PASS | localhost:3000, 192.168.1.1 live; tests add file:, javascript:, .local, DNS answers pointing to private IPs (never connected) |
| Schema validation rejects a broken sources file and falls back | PASS | 11 rejection tests; remote copy invalid / not JSON / older / 404 -> bundled copy; live: repo still empty, 404 -> bundled |
| Paywalled/opt-in/unofficial sources cannot be recommended | PASS | schema rule + test (NYT, Reuters via Google News) |
| Ratings shown only with an evidence link, linking to the rater | PASS | AllSides lines with "see AllSides" link; main only opens URLs present in the validated file |
| Settings saved owner-only, re-validated on load | PASS | settings.json 0600; tampered file test |

Not verified live: "Reset everything…" (native dialog; code path only), start-at-login (only applied in packaged builds; M6), rater link opening in the browser, dark mode of the setup window, VoiceOver.

## 2026-11-08 — M4 popover and read state
`npm test`: 102 tests pass (14 new: pile/unread/carry-over, popover view, edition names, Refresh merge, anchoring at edges, engine pause). Lint clean.
Live checks ran a test instance on a copy of Rachel's data (`NEWSCAT_USER_DATA`), driven through the localhost DevTools port.

| acceptance item | result | how |
|---|---|---|
| Clicking the cat empties the pile; the popover still lists the headlines | PASS | click on the pile -> wake + paper toss -> state.json pileClearedAt set, lastPile = 7 -> popover "7 headlines" (was "7 new") |
| Click with no pile opens the popover | PASS | click on the walking cat -> popover opened, masthead focused |
| Topic chips filter and are remembered | PASS | Music chip -> only the Music section; settings.json popoverFilter = "music" |
| Masthead name matches the edition | PASS | "The Evening Edition" for an 18:00 edition; unit tests for 2 AM = last night's evening edition |
| Popover stays on screen at every edge and Dock position | PASS (unit) / PASS (live, left edge) | anchor tests: center, left/right edge with tail over the cat, side Dock, short screen; live: cat at x=40 -> popover clamped to 8 pt, tail at 64 pt |
| Resizes to content, keeps its bottom on the cat | PASS | 634 pt with 7 headlines, 279 pt after filtering to one |
| Refresh | PASS | "Refreshing…" -> fetched 12 sources -> "Fetched" time updated; added nothing because the edition already had its 7 |
| Esc / click elsewhere closes | PASS (Esc) | window server shows no popover window after Esc; blur-to-close not exercised live |
| No article text stored | PASS | state.json holds headline, source, link, times, topic, paywall flag only |
| Pile survives restarts and expires after 48h | PASS (unit) | relaunch on real data restored the 7-headline pile |

Not verified live: opening a headline in the browser (would open Rachel's browser during a test; covered by code review: only links already in stored editions, https only, via shell.openExternal), dimming after opening (unit-tested), dark mode, VoiceOver.

## 2026-11-08 — M5 scheduler, catch-up, startup
`npm test`: 111 tests pass (9 new, fake clock + fake timers; DST and time zone tests set `TZ`). Lint clean.

| acceptance item | result | how |
|---|---|---|
| Edition fires on time | PASS | fake clock: runs at exactly 08:00 and 18:00, nothing in between (checks every <= 15 min) |
| Missed edition fires on wake | PASS | wake at 10:30 after missing 08:00 -> one run; a second wake does not run again; sleeping through two editions -> only the latest |
| Fetch on launch if the last fetch is > 6 h old | PASS | launch/wake only; periodic checks never count as stale |
| DST / time-zone change recomputes | PASS | US spring-forward (8 Mar 2026) and fall-back (1 Nov 2026) keep 08:00/18:00 local; LA -> Tokyo switch runs the Tokyo 18:00 edition within 15 min. Mutation check: with a 4 h re-check interval the time-zone test fails, so it really tests the interval. |
| Offline: keep last edition, retry with back-off, no error popup | PASS (unit) | retries at +5, +15, +30, +60 min, immediately on wake; in the app a run where every feed fails saves nothing and returns "failed". Not exercised live (would need the Mac offline). |
| Snooze suppresses the cat but not fetching | PASS (live) | test copy with snoozeUntil = now + 1 h and yesterday's edition: on launch the scheduler ran the catch-up (`start: fetching (due, evening edition)`, 7 headlines saved) while the window server showed no cat window |
| Launch at login | done in M3 | applied only in packaged builds (M6) |

Snooze options: 1 hour, or until the next morning edition time. Saved in settings.json (survives restarts). Menu shows "Snoozed until …" and "Wake the cat now".
Wake events: Electron powerMonitor `resume` and `unlock-screen` trigger a check.

## 2026-11-08 — Fix: popover did not reopen after closing (reported by Rachel)
Reproduced on a copy of Rachel's data: open -> Esc -> click the cat -> popover stayed hidden.
Root cause: the popover page reported its height inside requestAnimationFrame; once the window had been hidden the page is `visibilityState: hidden` and gets no animation frames (confirmed: "rAF did NOT fire within 1s"), so main never received the height and never showed the window. The first open only worked because the page had not been hidden yet.
Fix: measure synchronously after rendering (plus once when the web font loads). Also: clicking the cat while the popover is open now keeps it open (re-anchored) instead of toggling it closed; Esc or clicking elsewhere closes it.
Verified: open, Esc, click -> visible; click while open -> visible; 5 Esc/click cycles -> visible every time.
Follow-up (Rachel): clicking the cat should close the popover when it is open, i.e. toggle. Implemented with a 400 ms grace: if a real click first takes focus from the popover (closing it on blur), the same click is not treated as "open again". Verified with synthetic clicks: 6 clicks alternate visible/hidden; Esc then click reopens. A real mouse click (focus change) was not simulated; Rachel to confirm.

## 2026-11-08 — M6 packaging (everything that does not need Rachel's Apple credentials)
Tooling: electron-builder 26.18.0 (pinned, dev only). `npm audit`: one moderate advisory (minimatch ReDoS) inside electron-builder's build-time dependencies; it only processes our own config globs, not shipped. No signing identity in the keychain yet (`security find-identity -v -p codesigning`: 0 identities).

| Check | Result | How |
|---|---|---|
| Universal DMG builds | PASS | `npm run dist:adhoc` -> `out/NewsCat-0.0.1.dmg`, 225 MB; `lipo -archs`: x86_64 arm64 |
| App contents | PASS | `asar list`: only package.json, dist/, data/sources.json, assets/ (no preview art, no src/test/docs); prod node_modules = fast-xml-parser + strnum |
| Fuses | PASS | `@electron/fuses read`: RunAsNode, NODE_OPTIONS, --inspect, file-protocol extra privileges off; asar integrity validation + only-load-from-asar on |
| Launches packaged, art loads from asar | PASS | ran `out/mac-universal/NewsCat.app` and the copy inside the mounted DMG with `--user-data-dir=<scratch copy>`; window server showed a "NewsCat" 1470x110 window; screenshot showed the cat walking |
| Real data untouched | PASS | mtimes of Rachel's settings/state/sources-cache unchanged across the runs |
| Single instance | PASS | second launch with the same data folder exited (0) within 5 s; first kept running |
| Debug port refused | PASS | `--remote-debugging-port=9411`: process exited (1), port never listened |
| Ad-hoc + hardened runtime | FAIL as expected | dyld: "different Team IDs" (library validation). Ad-hoc test builds turn hardened runtime off; real builds keep it on with a Developer ID |
| Gatekeeper on ad-hoc build | rejected, as expected | `spctl --assess --type execute` -> rejected |
| Signed + notarized build, clean-Mac Gatekeeper test | NOT RUN | needs Rachel's Developer ID certificate and notarytool profile (docs/RELEASE.md) |
| Launch at login | NOT RUN | only applies to a packaged build; not registered from a throwaway build to avoid adding a login item to Rachel's Mac. Test with the first signed build |

## 2026-11-08 — User-named topics
Unit tests (113 pass): named topic saved with a stable id; its pasted feed becomes an edition source; survives save/reload and re-running setup; unpicking forgets it and its feeds; a built-in name, a 25-character name, HTML, bidi characters, duplicates and an 11th topic are refused; the popover shows its section and a full-name chip.
Live, on a copy of Rachel's data (dev build, debug port 9412, closed afterwards):
- Topics screen: "  Formula   1 " -> chip "Formula 1", selected; a 31-character name -> "Keep it to 24 characters or fewer."; "SCIENCE" -> picks the built-in Science.
- Sources screen: Formula 1 section says "Paste a site or feed link below to get Formula 1 headlines."; pasting https://feeds.bbci.co.uk/sport/formula1/rss.xml -> "Feed works: BBC Sport", latest headline shown; added under Formula 1.
- Finish: settings.json has customTopics [{own-u9f113, "Formula 1"}] and the feed under it. The existing evening edition was already full (7), so nothing was added to it; after clearing editions in the copy, a fresh fetch included "F1: Chequered Flag" (BBC Sport) under Formula 1.
- Popover view: chips All, US, World, AI, Film, Music, Formula 1; a Formula 1 section with 1 headline. (Read through the page's view call; not screenshotted.)
- Rachel's real data files: modification times unchanged. Her app restarted on the new build afterwards.

## 2026-11-08 — No topic limit; setup kept scrolling to the top (reported by Rachel)
- Selection: every topic with news gets one headline even past 7 (new test: 12 topics -> 12 headlines, one each; Refresh of a full edition adds the one topic that had none). Mutation check: with the old rule the test fails (113 pass, 1 fail).
- User-named topics: the 10-topic cap is gone from setup (settings files are cut at 100 only as damage control).
- Scroll: the setup page rebuilt itself on every action, resetting the scroll to the top. Now a re-render on the same screen keeps the scroll position, focus moves without scrolling, and an added feed is scrolled into view. Live on a copy of Rachel's data (debug port 9412, closed afterwards), the sources list scrolled to the bottom (scrollTop 1598): pasted "pitchfork.com" -> 1700 (found the Pitchfork feed), chose Music -> 1700 (focus on "Add feed"), Add feed -> 1635 with the new "Pitchfork · Music" row fully visible and focus back in the paste box.
