# CLAUDE.md — project rules for Claude Code

App name: **Cherub Courier** (decided 2026-11-11; was the working title "NewsCat"). It lives in one constant, `APP_NAME` in `src/shared/config.ts`. Internal identifiers (the `app://newscat` scheme host, `NEWSCAT_*` env vars, the npm package name) keep the old name on purpose.

## What this is
A macOS desktop app. A small pixel-art cherub flies along the bottom of the main display, above the Dock (he replaced the original cat, which was removed on 2026-11-11; older docs still say "cat"). Twice a day (a "morning edition" at 8am and an "evening edition" at 6pm local time) he delivers up to 7 news headlines. If the user ignores them, a pile of newspapers grows and the cat loafs on top of it. Clicking the cat opens a small popover with the headlines. Everything runs on the user's computer.

Read `docs/PRODUCT_SPEC.md` first, then `docs/BUILD_PLAN.md`. Do not add features that are not in the spec. If something is ambiguous, ask Rachel before building it.

## Hard constraints (do not violate)
1. **No server, no accounts, no analytics, no tracking.** The only network traffic allowed: fetching RSS/Atom feeds the user subscribed to, and fetching the curated source list file (`sources.json`) from its hosted URL. Nothing else.
2. **No AI/LLM calls, no API keys anywhere in the repo or app.** Ranking is "newest first, max 3 per topic" (see spec).
3. **Store only headline, source name, link, timestamp.** Never store or display article body text or images from publishers.
4. **Treat all feed content as untrusted.** Strip HTML, escape text, validate URLs (https only; upgrade http where possible), open links only via the OS default browser after a scheme check. Follow Electron security practice: `contextIsolation: true`, `nodeIntegration: false`, sandboxed renderer, strict CSP, no remote code.
5. **Be a polite feed client.** Honest User-Agent, conditional GET (ETag / If-Modified-Since), per-host rate limiting, timeouts, back-off on errors, no scraping of non-feed pages.
6. **Do not pre-select paywalled or terms-restricted sources** (e.g. The New York Times) in the "recommended" set. Users may add them themselves.
7. **Privacy of the maintainer's other work:** this is a personal side project. Never include any confidential employer or client code, data, names, or screenshots.

## Costs — always flag
Rachel wants every possible cost highlighted. Before you add or recommend anything that could cost money (paid services, subscriptions, paid tools, API usage, domains, certificates, hosting beyond free tiers), stop and write it as `[COST] <item>: <amount, one-time or recurring>, <how sure you are>` and ask for approval. Known: Apple Developer membership is already paid ($99/year). Everything else in v1 should cost $0.

## Confidence and verification
Rate key claims `[Certain]`, `[Likely]`, `[Guessing]`. The feed URLs in `data/sources.json` and several facts in `docs/OPEN_QUESTIONS.md` are **unverified** — test every one yourself (curl the feed, check it parses and has recent items) and record results. Never invent a URL, rating, or API behavior; say you don't know and test it.

## How to work with Rachel
Rachel is a software engineer (Python-strong, JavaScript fine). She wants direct feedback, flaws first, no filler praise. Challenge ideas that conflict with the spec instead of silently building them. Prefer small, reviewable commits. Explain non-obvious decisions in one or two sentences.
Push to `origin main` (github.com/rachelkph/news-sprite, public) after each milestone is done and committed (Rachel, 2026-11-08). Never commit or push sprite art (`assets/` image folders are gitignored; license of the current art is unchecked).

## Engineering conventions
- Language: TypeScript. Framework: Electron (recommended default; confirm in Milestone 0, see BUILD_PLAN). 
- Tests are required for: feed parsing (RSS 2.0 and Atom, malformed input), deduplication, headline selection, scheduler/catch-up, source-list schema validation. Use fixture feeds checked into `test/fixtures/`.
- Pixel art: render with `image-rendering: pixelated` at integer scale (default 1x = 63x58 pt; 3x and 2x were too big on a 1470pt-wide MacBook screen, decided 2026-11-08). Never smooth or non-integer scale.
- Keep sprite and behavior data-driven from `assets/manifest.json`.
- Commands you should keep working: `npm run dev`, `npm test`, `npm run lint`, `npm run build`.
- Lint is Biome + `tsc --noEmit` (typescript-eslint does not support TypeScript 7, checked 2026-11-08). Tests run TypeScript sources directly with Node's type stripping, so source files must use erasable syntax only (no enums, namespaces, or parameter properties) and import siblings with `.ts` extensions.
- Write a short `README.md` and keep `docs/` up to date when decisions change.
