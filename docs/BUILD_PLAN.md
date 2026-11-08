# Build plan

Work in order. Do not start a milestone until the previous one's acceptance tests pass and Rachel has seen the result. Each milestone ends with a short report: what works, what you verified, what you did not, and any `[COST]` items.

## M0 — Overlay spike (about 1 hour; do this first)
Goal: prove the cat can walk above the Dock, over other apps, without blocking clicks.
Build: a transparent, borderless, always-on-top window on the main display that shows one placeholder sprite (`assets/walk/walk_0.png`) moving left and right along the bottom edge above the Dock.
Also decide Electron vs. alternatives based on what you see (Tauri or native Swift are fallbacks if Electron cannot do this well).
Acceptance checks (record results):
- [ ] Transparent with no visible window frame or shadow.
- [ ] Click-through everywhere except the cat's own pixels; the user can still click apps underneath.
- [ ] Stays visible over a full-screen app (test Safari or Terminal full screen).
- [ ] Behaves across multiple Spaces/desktops (decide: visible on all Spaces).
- [ ] Position correct with the Dock at the bottom, on the side, enlarged, and auto-hidden (recompute from the usable display area).
- [ ] Handles display changes (unplug/replug, resolution change) without losing the cat.
- [ ] Menu bar icon with Hide/Show and Quit works.
- [ ] CPU usage at idle is low (report a number).
Stop and report. If any item fails, say so plainly and propose options.

## M1 — Cat engine
Data-driven animation from `assets/manifest.json`: walk (with direction flip), loaf idle, blink/tail-flick scheduling, sleep with floating z, pile layers 1–5, wake-on-click sequence, paper toss.
Acceptance: a dev panel (hidden, dev-only) can set "unread count" and "edition age" and the correct states/piles appear; pixel-perfect at the configured integer scale (default 1x) with no smoothing; sprite bottom row sits on the walking baseline.

## M2 — Feed engine (no UI)
Fetch + parse RSS 2.0 and Atom, normalize to `{headline, source, link, publishedAt, topic}`, dedupe, select (newest first, max 3 per topic, 7 total), persist locally.
Polite client: User-Agent, conditional GET, timeouts, per-host rate limit, back-off.
Security: sanitize text, validate URLs.
Acceptance (automated tests with fixtures): RSS and Atom parse, malformed XML does not crash, HTML stripped, duplicates removed, selection rules honored (including topics with fewer than 3 items), age window, caching/conditional GET, bad feed isolated from good feeds.

## M3 — Sources and onboarding
Implement `sources.json` loading and schema validation (local bundled copy plus optional remote fetch from the hosted URL, with the bundled copy as fallback). Build the 5 onboarding screens from `docs/ONBOARDING.md`, including the recommended-sources approval, pasted-link validation, and feed auto-discovery.
Acceptance: skipping setup leaves a working app; recommended list requires explicit approval; pasted RSS link works; pasted site without a feed shows the friendly message; local/private addresses rejected; schema validation rejects a broken sources file and falls back.

## M4 — Popover and read state
Popover anchored above the cat, Dock-aware, kept on screen. Headline rows, open in default browser, mark read, pile shrinks, Mark all read, Refresh, paywall tag.
Acceptance: opening a link marks it read and updates the pile; Mark all read empties the pile; no article text stored; popover stays on screen at every screen edge and Dock position.

## M5 — Scheduler, catch-up, startup
Two editions (8am/6pm local, editable), catch-up after sleep, fetch on launch if stale, time-zone/DST changes, launch at login (asked in onboarding), snooze options.
Acceptance (automated where possible, with a fake clock): edition fires on time; missed edition fires on wake; DST/time-zone change recomputes; snooze suppresses delivery animation but not fetching.

## M6 — Packaging and release
Code signing and notarization (Rachel has the Apple Developer membership; she must provide credentials herself — never commit them), DMG, GitHub Releases, README with install steps, short privacy statement ("nothing leaves your Mac except fetching the feeds you chose").
Do a signing + notarization dry run with the empty app early (alongside M1) so a notarization delay does not block release. `[COST]` flag anything not already paid.
Acceptance: a clean Mac can open the DMG with no Gatekeeper override; app launches and the cat appears.

## M7 — Polish and hardening
Accessibility basics for the popover (keyboard, VoiceOver labels), reduced-motion option, error states, weekly CI check that every feed in `sources.json` still resolves, docs update.

## Always
- Keep `npm test` green; add tests with each milestone.
- Record every verification you actually ran in `docs/VERIFIED.md`.
