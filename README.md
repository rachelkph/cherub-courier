# NewsCat (working title)

A pixel-art cat that walks above the macOS Dock and delivers twice-daily headlines.
Everything runs on your Mac: no accounts, no tracking, no AI.

Status: in development (milestone M6 of `docs/BUILD_PLAN.md`). No public release yet.

## Install

1. Download `NewsCat-<version>.dmg` from the [Releases](https://github.com/rachelkph/news-sprite/releases) page.
2. Open it and drag **NewsCat** to **Applications**.
3. Open NewsCat from Applications. macOS asks once whether to open an app downloaded from
   the internet; choose Open. (Releases are signed and notarized by Apple.)
4. Pick your topics and sources. The cat walks above your Dock and brings headlines
   twice a day; click him to read them.

Requires macOS 12 or later (Apple silicon or Intel). To uninstall, quit NewsCat from the
menu bar cat icon, choose Reset everything… first if you want your data deleted, then
drag the app to the Trash.

Privacy: nothing leaves your Mac except fetching the feeds you chose. See [PRIVACY.md](PRIVACY.md).

## Develop

Requires Node 22+ (type stripping is used to run tests on TypeScript sources) and macOS.

```sh
npm install
node node_modules/electron/install.js   # npm 11 may skip Electron's binary download
npm run dev        # build and launch
npm test           # unit tests
npm run lint       # Biome + TypeScript type check
npm run check-feeds  # liveness check of the seed feeds
npm run dist:adhoc   # local test build in out/ (this Mac only)
```

Releasing (signing, notarization, DMG): `docs/RELEASE.md`.

Menu bar cat icon: Hide/Show, Set up… (re-run setup), Reset everything… (deletes local data).

Dev-only controls (not in packaged builds):
- Menu bar cat icon > Dev: set the unread count and the oldest unread edition's age.
- Menu bar cat icon > Dev > Fetch edition now: fetch from your approved sources immediately.
- `NEWSCAT_DEV_STATE="unread,editionAge" npm run dev`: start in a given state.
- `NEWSCAT_DEV_FETCH=1 npm run dev`: fetch an edition on launch.
- `node scripts/fetch-edition.ts /tmp/state.json [topics]`: build an edition from all recommended sources in the terminal.

Local data lives in `~/Library/Application Support/NewsCat/` (`settings.json`, `state.json`, `sources-cache.json`).
The curated source list is `data/sources.json`; a newer copy is fetched from this repo's `main` branch at most once a day.

Two characters deliver the news; pick one under **Character** in the menu-bar menu (the cherub is the default):
- the **cherub** flies above the Dock: `assets/cherub/manifest.json`, art under `assets/cherub/`;
- the **cat** walks: `assets/manifest.json`, art at the top of `assets/`.

Sprites and animation timings live in those manifests; swap art there without code changes.
The sprite PNGs themselves are **not in this repository** (licensing of the art is unchecked).
Put them under `assets/` (folders listed in `.gitignore`) to run the app; without them, art-dependent tests are skipped and the menu offers only a character whose art is present.
Docs: `docs/PRODUCT_SPEC.md`, `docs/BUILD_PLAN.md`, `docs/RELEASE.md`, `docs/VERIFIED.md`.
