// Builds one edition: fetch the enabled sources, select headlines, record what
// was delivered so later editions do not repeat it.

import { type Deps, emptyCache, fetchAll, type FetchOutcome } from "./client.ts";
import { safeFeedUrl } from "./sanitize.ts";
import { type Candidate, cleanKeywords, DEFAULTS, selectEdition, urlKey } from "./select.ts";
import type { Edition, State } from "./store.ts";

export type Source = {
  id: string;
  name: string;
  feedUrl: string;
  topics: string[];
  paywall: boolean;
};

export type EditionRequest = {
  sources: Source[];
  topics: string[]; // enabled topic ids, in the user's order
  keywords: string[];
  slot: "morning" | "evening";
  scheduledFor: number;
  force?: boolean; // manual Refresh: ignore the per-feed minimum refetch interval
};

export type EditionResult = {
  state: State;
  edition: Edition;
  feeds: { id: string; result: FetchOutcome["result"]; status: string; error?: string; entries: number }[];
};

// Remember delivered links this long, longer than the selection window.
export const DELIVERED_TTL_MS = 7 * 24 * 3600_000;
// Keep editions this long (unread carry-over is 48h; a little extra for the popover).
export const EDITION_TTL_MS = 3 * 24 * 3600_000;

function editionId(slot: string, at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${slot}`;
}

export async function buildEdition(req: EditionRequest, state: State, deps: Deps): Promise<EditionResult> {
  const now = deps.now();
  const enabled = new Set(req.topics);
  const sources = req.sources.filter((s) => s.topics.some((t) => enabled.has(t)) && safeFeedUrl(s.feedUrl));

  const jobs = sources.map((s) => {
    const prev = state.feeds[s.id];
    return { id: s.id, cache: prev && prev.url === s.feedUrl ? prev : emptyCache(s.feedUrl) };
  });
  const outcomes = await fetchAll(jobs, deps, { force: req.force });

  const feeds = { ...state.feeds };
  for (const [id, o] of outcomes) feeds[id] = o.cache;

  const candidates: Candidate[] = sources.flatMap((s) => {
    // A source in several topics counts toward the first enabled one, in the user's order.
    const topic = req.topics.find((t) => s.topics.includes(t)) as string;
    return (feeds[s.id]?.entries ?? []).map((e) => ({ ...e, source: s.name, sourceId: s.id, topic, paywall: s.paywall }));
  });

  const delivered = state.delivered.filter((d) => now - d.at < DELIVERED_TTL_MS);
  const items = selectEdition(candidates, {
    now,
    ...DEFAULTS,
    keywords: cleanKeywords(req.keywords),
    exclude: new Set(delivered.map((d) => d.key)),
  });

  const edition: Edition = { id: editionId(req.slot, req.scheduledFor), slot: req.slot, scheduledFor: req.scheduledFor, fetchedAt: now, items };
  const editions = [...state.editions.filter((e) => e.id !== edition.id && now - e.fetchedAt < EDITION_TTL_MS), edition];

  return {
    state: { ...state, feeds, editions, delivered: [...delivered, ...items.map((i) => ({ key: urlKey(i.link), at: now }))] },
    edition,
    feeds: sources.map((s) => {
      const o = outcomes.get(s.id);
      return { id: s.id, result: o?.result ?? "error", status: feeds[s.id]?.status ?? "new", error: feeds[s.id]?.lastError, entries: feeds[s.id]?.entries.length ?? 0 };
    }),
  };
}
