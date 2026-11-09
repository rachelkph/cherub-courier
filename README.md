# NewsCat (working title)

A pixel-art cat that walks above the macOS Dock and delivers twice-daily headlines.
Everything runs on your Mac: no accounts, no tracking, no AI.

Status: in development (milestone M3 of `docs/BUILD_PLAN.md`). Not ready to install.

## Develop

Requires Node 22+ (type stripping is used to run tests on TypeScript sources) and macOS.

```sh
npm install
node node_modules/electron/install.js   # npm 11 may skip Electron's binary download
npm run dev        # build and launch
npm test           # unit tests
npm run lint       # Biome + TypeScript type check
npm run check-feeds  # liveness check of the seed feeds
```

Menu bar cat icon: Hide/Show, Set up… (re-run setup), Reset everything… (deletes local data).

Dev-only controls (not in packaged builds):
- Menu bar cat icon > Dev: set the unread count and the oldest unread edition's age.
- Menu bar cat icon > Dev > Fetch edition now: fetch from your approved sources immediately.
- `NEWSCAT_DEV_STATE="unread,editionAge" npm run dev`: start in a given state.
- `NEWSCAT_DEV_FETCH=1 npm run dev`: fetch an edition on launch.
- `node scripts/fetch-edition.ts /tmp/state.json [topics]`: build an edition from all recommended sources in the terminal.

Local data lives in `~/Library/Application Support/newscat/` (`settings.json`, `state.json`, `sources-cache.json`).
The curated source list is `data/sources.json`; a newer copy is fetched from this repo's `main` branch at most once a day.

Sprites and animation timings live in `assets/manifest.json`; swap art there without code changes.
The sprite PNGs themselves are **not in this repository** (the current placeholder art's license is unchecked, and new art is planned).
Put them under `assets/` (folders listed in `.gitignore`) to run the app; without them, art-dependent tests are skipped.
Docs: `docs/PRODUCT_SPEC.md`, `docs/BUILD_PLAN.md`, `docs/VERIFIED.md`.
