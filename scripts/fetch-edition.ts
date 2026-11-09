#!/usr/bin/env node
// Dev check: build one edition from the live seed feeds and print it.
// usage: node scripts/fetch-edition.ts STATE_FILE [topic,topic,...]
// Uses every recommended source in data/sources.json (as if approved).
import { readFileSync } from "node:fs";
import { realDeps } from "../src/main/feeds/client.ts";
import { buildEdition } from "../src/main/feeds/edition.ts";
import { DEFAULT_TOPICS } from "../src/main/settings.ts";
import { parseSourcesFile } from "../src/main/sources/schema.ts";
import { loadState, saveState } from "../src/main/feeds/store.ts";

const [statePath, topicArg] = process.argv.slice(2);
if (!statePath) {
  console.error("usage: node scripts/fetch-edition.ts STATE_FILE [topic,topic,...]");
  process.exit(2);
}
const file = parseSourcesFile(JSON.parse(readFileSync(new URL("../data/sources.json", import.meta.url), "utf8")));
const topics = topicArg ? topicArg.split(",") : DEFAULT_TOPICS;
const sources = file.sources
  .filter((s) => s.recommendedDefault)
  .map((s) => ({ id: s.id, name: s.name, feedUrl: s.feedUrl, topics: s.topics, paywall: s.paywall === true }));

const now = Date.now();
const slot = new Date(now).getHours() < 18 ? "morning" : "evening";
const started = performance.now();
const out = await buildEdition({ sources, topics, keywords: [], slot, scheduledFor: now }, await loadState(statePath), realDeps);
await saveState(statePath, out.state);

console.log(`${out.edition.id}: ${out.edition.items.length} headlines in ${Math.round(performance.now() - started)} ms\n`);
for (const i of out.edition.items) {
  const age = Math.round((now - i.publishedAt) / 60_000);
  console.log(`  [${i.topic}] ${i.headline}\n      ${i.source} · ${age < 60 ? `${age}m` : `${Math.round(age / 60)}h`} · ${i.link}`);
}
console.log("\nfeeds:");
for (const f of out.feeds) console.log(`  ${f.id.padEnd(22)} ${f.result.padEnd(13)} ${f.status.padEnd(6)} ${String(f.entries).padStart(3)} entries${f.error ? `  ${f.error}` : ""}`);
