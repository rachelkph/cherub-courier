# Handoff: NewsCat (working title)

Start here. This folder is everything Claude Code needs to begin building.

## Contents
- `CLAUDE.md` — rules for Claude Code (constraints, costs, verification, conventions)
- `docs/PRODUCT_SPEC.md` — what we are building and every decision made so far
- `docs/ONBOARDING.md` — first-run flow, including the "recommended sources" approval screen
- `docs/BUILD_PLAN.md` — milestones with acceptance tests (starts with a one-hour overlay spike)
- `docs/OPEN_QUESTIONS.md` — unverified facts and decisions deferred on purpose
- `data/sources.seed.json` — seed topics and sources (feed URLs are UNVERIFIED)
- `assets/` — pixel-art sprites, `manifest.json`, and previews (copy of the asset package)

## First message to paste into Claude Code
> Read CLAUDE.md, then docs/PRODUCT_SPEC.md, docs/ONBOARDING.md, docs/BUILD_PLAN.md, and docs/OPEN_QUESTIONS.md. Do not write app code yet. First, summarize the plan back to me in under 200 words, list anything in the spec you think is wrong or risky, and tell me what you would verify first. Then start Milestone 0 (the overlay spike) and report results before moving on.
