# Onboarding — first-run flow

Goal: under 90 seconds, every screen has a sensible default, and skipping must still leave a working app.

## Screen 1 — Welcome
Short intro, shows the cat walking. Button: Get started.

## Screen 2 — Pick topics
Fixed list (chips): US news, world news, AI and tech, creative coding and dev tools, business and markets, science, film and TV, music, gaming, sports, culture and books, design.
- Optional field: "Add keywords" (free text, comma separated). Explain clearly: keywords move matching stories to the top within their topic, from the sources you pick; they never hide other stories and do not find new sources. (Changed from "filter" 2026-11-08 to match the confirmed boost behavior.)
- Default if skipped: US news, world news, AI and tech.

## Screen 3 — Choose sources
Two paths:
1. **Use recommended sources (default, one tap).** Shows each selected topic's recommended list, all pre-checked, one line per source. The user must press **Approve** before anything is fetched; they can uncheck sources first.
2. **Customize.** Same list, nothing pre-checked, plus an input: paste an RSS link or a site link.

Rules for the recommended screen:
- Header note: "No news source is unbiased. These are well-regarded and mixed on purpose. Independent raters sometimes disagree."
- Each row: source name, short description, and a small "rated by <rater>: <label>, <date>" line **only where the source file has a rating with an evidence link**; link to the rater instead of copying their data.
- Do not include paywalled or terms-restricted sources in the recommended set; label "paywall" where shown.
- For news topics, include at least three sources with differing ratings when available. The seed list currently has no confirmed center-right feed (see OPEN_QUESTIONS); the screen must still work without one.

Pasted links:
- If the link is a feed, validate it (fetch, parse, show the latest headline as proof).
- If it is a site, try feed auto-discovery (`<link rel="alternate" type="application/rss+xml|atom+xml">`, anywhere in `<head>`), then the usual feed addresses on that site (`/feed/`, `/rss/index.xml`, `/rss.xml`, `/feed.xml`, `/rss/`, `/atom.xml`, `/index.xml`). If none is a feed, show: "We couldn't find a feed for this site." No scraping: links in the page body are never followed.
- Only fetch from the user's machine. Reject non-http(s) and local/private addresses.

## Screen 4 — Schedule and startup
- Edition times: default 8:00 and 18:00 (editable).
- "Start the cat when my Mac turns on": default on, asked here.

## Screen 5 — Meet the cat
First delivery: the cat arrives with a sample/real edition and the user can click him to see the popover. Show where Snooze/Hide live (menu bar icon).

## Data
Settings and read-state are stored locally only (a JSON file in the app's user-data directory). A "Reset everything" option must exist.
