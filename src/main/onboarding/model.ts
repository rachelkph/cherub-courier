// Data for the setup screens, and validation of what they send back. Pure.

import { cleanKeywords } from "../feeds/select.ts";
import { type CustomSource, customSourceId, defaultSettings, MAX_CUSTOM_SOURCES, type Settings } from "../settings.ts";
import type { SourcesFile } from "../sources/schema.ts";

export type SourceView = {
  id: string;
  name: string;
  description: string;
  topics: string[];
  paywall: "yes" | "no" | "unknown";
  unofficial: boolean;
  recommended: boolean; // listed (and pre-checked) on the recommended screen
  ratings: { rater: string; label: string; asOf: string; evidenceUrl: string }[];
};

export type OnboardingModel = {
  topics: { id: string; label: string; recommendedCount: number }[];
  defaultTopics: string[];
  sources: SourceView[];
  settings: Pick<Settings, "topics" | "keywords" | "approvedSourceIds" | "editionTimes" | "launchAtLogin"> & {
    customSources: { feedUrl: string; name: string; topic: string }[];
  };
};

export function buildModel(file: SourcesFile, settings: Settings): OnboardingModel {
  const sources: SourceView[] = file.sources.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    topics: s.topics,
    paywall: s.paywall === true ? "yes" : s.paywall === false ? "no" : "unknown",
    unofficial: s.unofficialFeed,
    recommended: s.recommendedDefault,
    ratings: s.ratings,
  }));
  return {
    topics: file.topics.map((t) => ({ id: t.id, label: t.label, recommendedCount: sources.filter((s) => s.recommended && s.topics.includes(t.id)).length })),
    defaultTopics: defaultSettings().topics,
    sources,
    settings: {
      topics: settings.topics,
      keywords: settings.keywords,
      approvedSourceIds: settings.approvedSourceIds,
      editionTimes: settings.editionTimes,
      launchAtLogin: settings.launchAtLogin,
      customSources: settings.customSources.map(({ feedUrl, name, topic }) => ({ feedUrl, name, topic })),
    },
  };
}

// Feeds that checkLink confirmed during this session, by URL.
export type VerifiedFeeds = Map<string, { title: string }>;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// The setup window is our code, but its messages are still checked: only known
// topics and sources, only pasted feeds that were verified, sane times.
export function applyFinish(payload: unknown, file: SourcesFile, prev: Settings, verified: VerifiedFeeds): Settings {
  const p = (typeof payload === "object" && payload !== null ? payload : {}) as Record<string, unknown>;
  const topicIds = new Set(file.topics.map((t) => t.id));
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

  let topics = [...new Set(list(p.topics))].filter((t) => topicIds.has(t));
  if (topics.length === 0) topics = defaultSettings().topics;
  const picked = new Set(topics);

  const approvedSourceIds = [...new Set(list(p.approvedSourceIds))].filter((id) => {
    return file.sources.find((x) => x.id === id)?.topics.some((t) => picked.has(t)) ?? false;
  });

  const customSources: CustomSource[] = [];
  for (const c of Array.isArray(p.customSources) ? p.customSources : []) {
    if (typeof c !== "object" || c === null || customSources.length >= MAX_CUSTOM_SOURCES) continue;
    const { feedUrl, topic } = c as Record<string, unknown>;
    if (typeof feedUrl !== "string" || typeof topic !== "string" || !picked.has(topic)) continue;
    const ok = verified.get(feedUrl) ?? prev.customSources.find((x) => x.feedUrl === feedUrl);
    if (!ok || customSources.some((x) => x.feedUrl === feedUrl)) continue;
    const name = "title" in ok ? ok.title : ok.name;
    customSources.push({ id: customSourceId(feedUrl), name, feedUrl, topic });
  }

  const times = (typeof p.editionTimes === "object" && p.editionTimes !== null ? p.editionTimes : {}) as Record<string, unknown>;
  const morning = typeof times.morning === "string" && HHMM.test(times.morning) ? times.morning : prev.editionTimes.morning;
  const evening = typeof times.evening === "string" && HHMM.test(times.evening) ? times.evening : prev.editionTimes.evening;
  const keywords = typeof p.keywords === "string" ? cleanKeywords(p.keywords.split(",")) : prev.keywords;

  return {
    ...prev,
    onboarded: true,
    topics,
    keywords,
    approvedSourceIds,
    customSources,
    editionTimes: { morning, evening },
    launchAtLogin: typeof p.launchAtLogin === "boolean" ? p.launchAtLogin : prev.launchAtLogin,
  };
}

// "Skip setup": a working app with no sources approved (nothing is fetched until
// the user approves sources in Settings).
export function applySkip(prev: Settings): Settings {
  return { ...defaultSettings(), onboarded: true, launchAtLogin: prev.launchAtLogin };
}
