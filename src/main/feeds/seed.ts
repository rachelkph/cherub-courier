// Temporary source list for development: the recommended sources from the seed
// file. M3 replaces this with the validated sources.json loader.

import type { Source } from "./edition.ts";

type SeedSource = { id: string; name: string; feedUrl: string; topics: string[]; paywall: unknown; recommendedDefault: boolean; userOptInOnly: boolean; unofficialFeed: boolean };

export const DEFAULT_TOPICS = ["us-news", "world-news", "ai-tech"];

export function recommendedSources(seed: { sources: SeedSource[] }): Source[] {
  return seed.sources
    .filter((s) => s.recommendedDefault && !s.userOptInOnly && !s.unofficialFeed)
    .map((s) => ({ id: s.id, name: s.name, feedUrl: s.feedUrl, topics: s.topics, paywall: s.paywall === true }));
}
