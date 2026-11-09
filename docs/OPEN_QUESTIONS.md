# Open questions and unverified facts

## Decisions still open (ask Rachel)
1. **App name** — undecided. Keep in one constant.
2. **Center-right / right-leaning news outlet** — Rachel is unsure; add later. The seed list has no confirmed one. The system must work without it.
3. **Electron vs alternatives** — Electron is a recommendation, not a decision. Confirm in M0.
4. **Marking items read** — DECIDED 2026-11-08 (Rachel): clicking the cat marks the headlines in his pile read (paper-toss animation empties the pile); the popover still lists them.
4b. **Unread carry-over** — DECIDED 2026-11-08 (Claude, Rachel delegated): unread headlines carry over across editions until the cat is clicked, but expire 48h after the edition that delivered them (at most 4 editions). The popover shows everything that was in the pile, grouped by edition, newest first; each edition still has at most 7 headlines.
5. **Item age window** — proposed 48 hours; confirm.
6. **When the cat falls asleep** — proposed after more than 2 editions are unread; confirm.
7. **Sprite look** — Rachel may iterate on the pixel art later. Keep the manifest-driven design so art can be swapped without code changes.
8. **Opt-in topics beyond the first five** — only US news, world news, AI and tech, film and TV, and music have researched seed sources. The others are empty placeholders.

## Planned art change (told 2026-11-08, no assets yet)
Rachel plans to replace the cat with a **news boy cycling along the Dock**. His **satchel grows** as unread news accumulates, until he is **covered in a pile of newspapers**. Implications when the art arrives:
- "walk" becomes a cycling loop; the loaf/sleep-on-pile states and the separate pile sprites likely become satchel-size stages and a final "buried" state, still driven by the unread count.
- Keep the engine data-driven from `assets/manifest.json` and keep unread -> stage mapping in data, so the change is mostly new sprites and a manifest edit, plus engine work where states differ (no pile under him; the click animation will need new art).
- Name: "NewsCat" is still a placeholder (APP_NAME in `src/shared/config.ts`).

## Unverified facts (test before relying on them)
- **Feed URLs in `data/sources.json`:** all 24 verified live on 2026-11-08 (see docs/VERIFIED.md). Re-check periodically (`npm run check-feeds`; weekly CI planned for M7).
- **Reuters and AP have no official RSS.** Reuters stopped its public feeds in June 2020; AP's feeds are unreliable and apnews.com blocks automated tools (per third-party reports). The Google News search-feed workaround is unofficial and undocumented; its terms of use have not been checked. Treat these as optional, off by default.
- **NYT RSS terms.** An older case suggests the NYT objects to apps preloading its feed. Current terms were not checked. Do not pre-select it; allow user-added only.
- **Displaying bias ratings (AllSides, Ad Fontes).** Whether their ratings can be shown in-app is unknown. Link to the raters; do not copy their data until terms are checked.
- **Keyword-to-feed discovery** (e.g. via news search feeds). Not verified as free or permitted. Out of v1.
- **Electron behaviors**: click-through windows with per-pixel hit testing, behavior over full-screen apps and across Spaces, Dock-position detection. Not tested yet — M0 verifies.
- **Sprite licensing:** the head of the cat comes from a PixelLab free-trial generation. Check PixelLab's current terms for commercial/shared use before public release.
- **Notarization timing** for a first submission from this account.

## Costs known so far
- Apple Developer Program: $99/year, already paid.
- Everything else planned for v1: $0. Paywalled articles (NYT, WSJ) require the reader's own subscription; the app costs nothing for that.
