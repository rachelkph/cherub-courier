# Open questions and unverified facts

## Decisions still open (ask Rachel)
1. **App name** — undecided. Keep in one constant.
2. **Center-right / right-leaning news outlet** — Rachel is unsure; add later. The seed list has no confirmed one. The system must work without it.
3. **Electron vs alternatives** — Electron is a recommendation, not a decision. Confirm in M0.
4. **Marking items read** — default in this plan: opening the link marks it read. Confirm with Rachel.
5. **Item age window** — proposed 48 hours; confirm.
6. **When the cat falls asleep** — proposed after more than 2 editions are unread; confirm.
7. **Sprite look** — Rachel may iterate on the pixel art later. Keep the manifest-driven design so art can be swapped without code changes.
8. **Opt-in topics beyond the first five** — only US news, world news, AI and tech, film and TV, and music have researched seed sources. The others are empty placeholders.

## Unverified facts (test before relying on them)
- **Every feed URL in `data/sources.seed.json`.** URLs came from third-party lists. Some were not found in any source and are marked `"feedSource": "memory"`.
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
