# Next steps (written 2026-11-10, before Rachel's macOS update)

Where things stand, and what is left, so work can pick up in a new session.
Start a new Claude Code session in `~/Desktop/Projects/newscat` and say "read docs/NEXT_STEPS.md".

## Where things stand
- Milestones M0–M5 are done. M6 (release) is built except the parts that need Rachel's credentials. M7 has not started.
- Everything is on GitHub (`main`, github.com/rachelkph/news-sprite) except the art, which stays off on purpose (see "Art" below).
- Done since the M6 prep:
  - Front page popover (rolling 24 h).
  - "Pixel Gazette" look with a top story.
  - The **cherub** as the default character, with the cat as an option (menu bar > Character), shown at 2/3 size.
  - The newspaper is named per character: "The Cloud Nine Chronicle" for the cherub, "The Mewsletter" for the cat.
  - A newspaper mound for the cherub to land on, drawn by `scripts/mound.mjs`.
  - Buried up to the neck at **8 or more** unread.
- 138 tests pass (`npm test`); lint clean (`npm run lint`).

## After the macOS update: start the app again
The development build does not start at login (only a packaged release does). To run it:

```sh
cd ~/Desktop/Projects/newscat
npm run dev
```

Check:
- The cherub flies above the Dock.
- Clicking him opens the popover.
- The menu bar icon has Character, Snooze, Set up, and Dev.

If `npm run dev` fails after the update, run `npm install` first (a new Xcode or Command Line Tools version can need a reinstall).

## Art: back it up
The art is not in git, so the only copies are on this Mac:
- `~/Desktop/Projects/newscat/assets/` (cat sprites at the top, cherub in `assets/cherub/`)
- `~/Downloads/cherub_anim_assets/` (the original cherub cut)

Copy both somewhere safe (iCloud Drive, an external disk) before updating.

The mound images (`assets/cherub/pile/`) can be redrawn any time with `node scripts/mound.mjs`.

## M7 — polish and hardening (Claude can do all of this; nothing needed from Rachel)
1. **Popover accessibility:**
   - Full keyboard use: Tab through chips and headlines, Enter opens, Esc closes.
   - VoiceOver labels on chips, headlines, the top story and the footer buttons.
   - Check with VoiceOver on.
2. **Reduced motion:**
   - When macOS "Reduce motion" is on, the character moves less: no flying back and forth, no paper toss.
   - The popover still opens.
3. **Error states:**
   - A friendly line when offline or when every feed failed.
   - A per-source note when one feed keeps failing or disappears (e.g. "Pitchfork hasn't loaded since Monday").
   - Never a scary error.
4. **Weekly feed check in CI:**
   - A GitHub Actions workflow runs `node scripts/check-feeds.mjs` weekly and fails if a bundled feed stops resolving.
   - `[COST]` $0 on a public repo (free Actions minutes) `[Likely]`; confirm before adding.
5. **Docs pass:** README, PRODUCT_SPEC, and VERIFIED brought up to date.

## M6 — release (needs Rachel first)
Full steps are in `docs/RELEASE.md`. Rachel does these herself; credentials never go through Claude or into git.
1. **Developer ID certificate:** Xcode > Settings > Accounts > team > Manage Certificates > + > Developer ID Application.
2. **Notarization login:** in Terminal, `xcrun notarytool store-credentials newscat-notary` (Apple ID, app-specific password, Team ID).
3. **Art licensing**, before a public DMG (the art ships inside the app):
   - Cat: check PixelLab's terms (the cat's head came from a free-trial generation).
   - Cherub: check Perchance's terms for the generator used.
   - Mound: our own art; no question.
4. **Decisions:**
   - **App name:** DONE 2026-11-11, **Cherub Courier** (bundle id `io.github.rachelkph.cherubcourier`; data copied from the old `NewsCat` folder on first launch). The repo stays `news-sprite`.
   - **App icon:** 1024x1024, probably the cherub; needed for the release.
   - **First version:** proposed 0.1.0.
   - **DMG:** one universal DMG (225 MB), or separate Apple-silicon and Intel ones.

Then Claude runs `APPLE_KEYCHAIN_PROFILE=newscat-notary npm run release`, which builds, signs, notarizes, staples, and verifies. Rachel tests the DMG on a clean Mac (acceptance: opens with no Gatekeeper override, the character appears).

`[COST]` Only the Apple Developer Program ($99/yr, already paid).

## Small things noticed, not yet changed
- **Toss jump:** when the cherub is clicked while buried, he climbs out on top of the big mound. When the rolls start flying, the scene switches to the smaller pile, a visible jump. It could ease into it with a mound-to-pile transition frame.
- **Pile size:** the cherub's pile only reaches 4 layers before he is buried (8+ unread buries him). The 5-layer pile now shows only during the toss after he climbs out.
- **Tray icon:** the menu-bar icon is the cherub's first hover frame shrunk to 18 px. A purpose-made icon would read better; it could come with the app icon.
- **Art notes still unbuilt:** none. The mound and buried stage are done.

## Rules to keep (from CLAUDE.md and Rachel)
- Never commit sprite art.
- Push to `origin main` after each milestone.
- Flag every `[COST]`.
- Test on a copy of the data (`NEWSCAT_USER_DATA=<copy>`), never Rachel's real data.
- Never leave a debug port open on her running app.
