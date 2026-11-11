#!/usr/bin/env node
// Checks every feed in data/sources.json: reachable, parses as RSS/Atom,
// has recent items. For http URLs, also tries the https upgrade.
// Rough regex parsing on purpose: this is a liveness check, not the app's parser.
// --max-age-hours=N: how old the newest item may be (default 72). The weekly CI run
// uses three weeks, so slow feeds (Pitchfork's best albums) do not fail it.
import { readFile } from "node:fs/promises";

const UA = "CherubCourier-feedcheck/0.1 (+personal project; liveness check)";
const file = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? new URL("../data/sources.json", import.meta.url);
const seed = JSON.parse(await readFile(file, "utf8"));
const maxAgeArg = process.argv.find((a) => a.startsWith("--max-age-hours="));
const MAX_AGE_H = maxAgeArg ? Number(maxAgeArg.split("=")[1]) : 72;
if (!(MAX_AGE_H > 0)) throw new Error(`bad ${maxAgeArg}`);

async function probe(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal, redirect: "follow" });
    const body = await res.text();
    const kind = /<rss[\s>]/i.test(body) ? "rss" : /<feed[\s>]/i.test(body) ? "atom" : "none";
    const items = (body.match(/<(item|entry)[\s>]/gi) ?? []).length;
    const dates = [...body.matchAll(/<(pubDate|published|updated|dc:date)>([^<]+)</gi)]
      .map((m) => Date.parse(m[2].trim()))
      .filter((d) => !Number.isNaN(d));
    const newest = dates.length ? Math.max(...dates) : null;
    return {
      status: res.status,
      finalUrl: res.url,
      etag: Boolean(res.headers.get("etag")),
      lastModified: Boolean(res.headers.get("last-modified")),
      kind,
      items,
      newestAgeH: newest ? Math.round((Date.now() - newest) / 36e5) : null,
    };
  } catch (e) {
    return { error: e.name === "AbortError" ? "timeout" : e.cause?.code ?? e.message };
  } finally {
    clearTimeout(t);
  }
}

const results = [];
for (const s of seed.sources) {
  const r = { id: s.id, url: s.feedUrl, ...(await probe(s.feedUrl)) };
  if (s.feedUrl.startsWith("http://")) {
    const h = await probe(s.feedUrl.replace(/^http:/, "https:"));
    r.httpsUpgrade = h.error ? `fail: ${h.error}` : `${h.status} ${h.kind} ${h.items} items`;
  }
  r.ok = r.status === 200 && r.kind !== "none" && r.items > 0 && r.newestAgeH !== null && r.newestAgeH <= MAX_AGE_H;
  results.push(r);
  await new Promise((res) => setTimeout(res, 500)); // be polite
}

if (process.argv.includes("--json")) console.log(JSON.stringify(results, null, 2));
else console.table(results.map(({ url, finalUrl, ...r }) => r));
process.exitCode = results.every((r) => r.ok) ? 0 : 1;
