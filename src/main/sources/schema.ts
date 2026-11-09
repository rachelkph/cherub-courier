// The curated sources file (data/sources.json, or a newer copy downloaded from
// the project's GitHub). Validated in full: a remote copy is untrusted input, and
// a broken file must never reach the UI. parseSourcesFile throws with the path of
// the first problem.

import { plainText, safeFeedUrl, safeUrl } from "../feeds/sanitize.ts";

export const SOURCES_SCHEMA_VERSION = 1;

export type Rating = { rater: string; label: string; asOf: string; evidenceUrl: string };

export type CuratedSource = {
  id: string;
  name: string;
  description: string;
  topics: string[];
  feedUrl: string;
  paywall: boolean | "unknown";
  recommendedDefault: boolean;
  userOptInOnly: boolean;
  unofficialFeed: boolean;
  ratings: Rating[];
};

export type Topic = { id: string; label: string };

export type SourcesFile = {
  schemaVersion: typeof SOURCES_SCHEMA_VERSION;
  lastReviewed: string; // YYYY-MM-DD
  topics: Topic[];
  sources: CuratedSource[];
};

type Obj = Record<string, unknown>;
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function fail(path: string, want: string): never {
  throw new Error(`sources: ${path} ${want}`);
}
function obj(v: unknown, path: string): Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) fail(path, "must be an object");
  return v as Obj;
}
function arr(v: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(v)) fail(path, "must be an array");
  if (v.length > max) fail(path, `has more than ${max} entries`);
  return v;
}
function id(v: unknown, path: string): string {
  if (typeof v !== "string" || v.length > 60 || !ID.test(v)) fail(path, "must be a lowercase-hyphenated id");
  return v;
}
function text(v: unknown, path: string, max: number, required = true): string {
  const t = plainText(v, max + 1);
  if (required && !t) fail(path, "must be non-empty text");
  if (t.length > max) fail(path, `must be at most ${max} characters`);
  return t;
}
function bool(v: unknown, path: string): boolean {
  if (typeof v !== "boolean") fail(path, "must be true or false");
  return v;
}

export function parseSourcesFile(raw: unknown): SourcesFile {
  const root = obj(raw, "file");
  if (root.schemaVersion !== SOURCES_SCHEMA_VERSION) fail("schemaVersion", `must be ${SOURCES_SCHEMA_VERSION}`);
  if (typeof root.lastReviewed !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(root.lastReviewed)) fail("lastReviewed", "must be YYYY-MM-DD");

  const topics = arr(root.topics, "topics", 50).map((t, i): Topic => {
    const o = obj(t, `topics[${i}]`);
    return { id: id(o.id, `topics[${i}].id`), label: text(o.label, `topics[${i}].label`, 40) };
  });
  const topicIds = new Set(topics.map((t) => t.id));
  if (topicIds.size !== topics.length) fail("topics", "has duplicate ids");

  const seen = new Set<string>();
  const sources = arr(root.sources, "sources", 500).map((s, i): CuratedSource => {
    const p = `sources[${i}]`;
    const o = obj(s, p);
    const sid = id(o.id, `${p}.id`);
    if (seen.has(sid)) fail(`${p}.id`, `duplicates "${sid}"`);
    seen.add(sid);

    const st = arr(o.topics, `${p}.topics`, 12).map((t, j) => id(t, `${p}.topics[${j}]`));
    if (st.length === 0) fail(`${p}.topics`, "must list at least one topic");
    for (const t of st) if (!topicIds.has(t)) fail(`${p}.topics`, `references unknown topic "${t}"`);

    const feedUrl = safeFeedUrl(o.feedUrl);
    if (!feedUrl) fail(`${p}.feedUrl`, "must be a public http(s) URL");

    if (o.paywall !== true && o.paywall !== false && o.paywall !== "unknown") fail(`${p}.paywall`, 'must be true, false or "unknown"');
    const src: CuratedSource = {
      id: sid,
      name: text(o.name, `${p}.name`, 80),
      description: text(o.description, `${p}.description`, 160),
      topics: st,
      feedUrl,
      paywall: o.paywall,
      recommendedDefault: bool(o.recommendedDefault, `${p}.recommendedDefault`),
      userOptInOnly: bool(o.userOptInOnly, `${p}.userOptInOnly`),
      unofficialFeed: bool(o.unofficialFeed, `${p}.unofficialFeed`),
      ratings: arr(o.ratings ?? [], `${p}.ratings`, 5).map((r, j) => {
        const rp = `${p}.ratings[${j}]`;
        const ro = obj(r, rp);
        const evidenceUrl = safeUrl(ro.evidenceUrl);
        if (!evidenceUrl) fail(`${rp}.evidenceUrl`, "must be a public https URL");
        return { rater: text(ro.rater, `${rp}.rater`, 40), label: text(ro.label, `${rp}.label`, 40), asOf: text(ro.asOf, `${rp}.asOf`, 20), evidenceUrl };
      }),
    };
    // Hard rule from CLAUDE.md: never pre-select paywalled, restricted or unofficial sources.
    if (src.recommendedDefault && (src.paywall === true || src.userOptInOnly || src.unofficialFeed)) {
      fail(p, "is recommended by default but is paywalled, user-opt-in-only or unofficial");
    }
    return src;
  });

  return { schemaVersion: SOURCES_SCHEMA_VERSION, lastReviewed: root.lastReviewed, topics, sources };
}
