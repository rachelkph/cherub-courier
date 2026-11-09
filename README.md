# NewsCat (working title)

A pixel-art cat that walks above the macOS Dock and delivers twice-daily headlines.
Everything runs on your Mac: no accounts, no tracking, no AI.

Status: in development (milestone M1 of `docs/BUILD_PLAN.md`). Not ready to install.

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

Dev-only controls (not in packaged builds):
- Menu bar cat icon > Dev: set the unread count and the oldest unread edition's age.
- `NEWSCAT_DEV_STATE="unread,editionAge" npm run dev`: start in a given state.

Sprites and animation timings live in `assets/manifest.json`; swap art there without code changes.
Docs: `docs/PRODUCT_SPEC.md`, `docs/BUILD_PLAN.md`, `docs/VERIFIED.md`.
