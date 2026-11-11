# Next steps (written 2026-11-10, before Rachel's macOS update)

Where things stand, and what is left, so work can pick up in a new session.
Start a new Claude Code session in `~/Desktop/Projects/cherub-courier` and say "read docs/NEXT_STEPS.md".

## Where things stand
- Milestones M0–M5 are done. M6 (release) is built except the parts that need Rachel's credentials. M7 has not started.
- Everything is on GitHub (`main`, github.com/rachelkph/cherub-courier) except the art, which stays off on purpose (see "Art" below).
- Done since the M6 prep:
  - Front page popover (rolling 24 h).
  - "Pixel Gazette" look with a top story.
  - The **cherub** delivers the news, shown at 2/3 size. The cat was removed 2026-11-11 (Rachel).
  - The newspaper is "The Cloud Nine Chronicle".
  - A newspaper mound for the cherub to land on, drawn by `scripts/mound.mjs`.
  - Buried up to the neck at **8 or more** unread.
- 138 tests pass (`npm test`); lint clean (`npm run lint`).

## After the macOS update: start the app again
The development build does not start at login (only a packaged release does). To run it:

```sh
cd ~/Desktop/Projects/cherub-courier
npm run dev
```

Check:
- The cherub flies above the Dock.
- Clicking him opens the popover.
- The menu bar icon has Hide, Snooze, Set up, and Dev.

If `npm run dev` fails after the update, run `npm install` first (a new Xcode or Command Line Tools version can need a reinstall).

## Art: back it up
The art is not in git, so the only copies are on this Mac:
- `~/Desktop/Projects/cherub-courier/assets/cherub/`
- `~/Downloads/cherub_anim_assets/` (the original cherub cut)

Copy both somewhere safe (iCloud Drive, an external disk) before updating.

The mound images (`assets/cherub/pile/`) can be redrawn any time with `node scripts/mound.mjs`.

## M7 — polish and hardening (Claude can do all of this; nothing needed from Rachel)
1. **Popover accessibility:** SKIPPED (Rachel, 2026-11-11). The app centers on clicking a character
   above the Dock, so keyboard and VoiceOver work in the popover would help little; not required for
   a free personal app. Revisit only for a public release.
2. **Reduced motion:** BUILT 2026-11-11. With macOS "Reduce motion" on (read live from
   `prefers-reduced-motion`), the character stays in place (wings still flap, blinks and z's stay), no hop,
   and a click delivers at once with no wake-and-toss; the popover still opens. Engine tests cover
   the cherub; Rachel's live check pending.
3. **Error states:** SKIPPED (Rachel, 2026-11-11).
4. **Weekly feed check in CI:** BUILT 2026-11-11. `.github/workflows/check-feeds.yml` runs
   `scripts/check-feeds.mjs --max-age-hours=504` Mondays 15:00 UTC (and by hand from the Actions
   tab); fails if a feed is gone, broken, or silent for 3 weeks. `[COST]` $0 (public repo).
   GitHub pauses scheduled workflows after 60 days with no commits; re-enable from the Actions tab.
5. **Docs pass:** README, PRODUCT_SPEC, and VERIFIED brought up to date.

## M6 — release (needs Rachel first)
Full steps are in `docs/RELEASE.md`. Rachel does these herself; credentials never go through Claude or into git.
1. **Developer ID certificate:** Xcode > Settings > Accounts > team > Manage Certificates > + > Developer ID Application.
2. **Notarization login:** in Terminal, `xcrun notarytool store-credentials newscat-notary` (Apple ID, app-specific password, Team ID).
3. **Art licensing**, before a public DMG (the art ships inside the app):
   - Cherub: check Perchance's terms for the generator used.
   - Mound: our own art; no question.
4. **Decisions:**
   - **App name:** DONE 2026-11-11, **Cherub Courier** (bundle id `io.github.rachelkph.cherubcourier`; data copied from the old `NewsCat` folder on first launch). The repo was renamed to `cherub-courier` on 2026-11-11 (GitHub redirects the old `news-sprite` URLs; never reuse that name, since 0.1.0 fetches its source list through the redirect).
   - **App icon:** DONE 2026-11-11. `node scripts/icon.mjs` draws `build/icon.png` and `build/icon.icns` (the cherub over a pixel cloud in a Cloud Nine sky); not in git, since it contains his art. `npm run release` regenerates it.
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
