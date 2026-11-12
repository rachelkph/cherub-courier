// What the cat's pile holds and what the popover shows. Pure functions over the
// stored state, so restarts, Refresh and the 48h carry-over behave the same.
//
// The cat's pile is what's new: headlines he delivered that you haven't seen (you
// see them by clicking him). The popover is a front page of what's top right now:
// the best stories of the last 24 hours from your sources' latest feeds. What the
// cat brought most recently is tagged NEW until his next delivery. Seen stories
// stay while they are still current.

import type { Source } from "../feeds/edition.ts";
import { type Candidate, FUTURE_TOLERANCE_MS, headlineTokens, isDuplicateHeadline, keywordMatch, urlKey } from "../feeds/select.ts";
import type { EditionItem, State } from "../feeds/store.ts";
import { currentEdition, type EditionTimes } from "../schedule.ts";
import { CHARACTER } from "../../shared/config.ts";

export const CARRY_OVER_MS = 48 * 3600_000;

type Located = { item: EditionItem; key: string; scheduledFor: number; slot: "morning" | "evening" };

function allItems(state: State): Located[] {
  return state.editions.flatMap((e) => e.items.map((item) => ({ item, key: urlKey(item.link), scheduledFor: e.scheduledFor, slot: e.slot })));
}

// Unread: added after the user's last click on the cat, and not older than 48h.
export function unread(state: State, now: number): Located[] {
  return allItems(state).filter((l) => l.item.addedAt > state.pileClearedAt && now - l.item.addedAt <= CARRY_OVER_MS);
}

// The cat engine's inputs: pile size, and how many editions have come since the
// oldest unread one (he falls asleep after more than 2).
export function catInputs(state: State, now: number): { unread: number; editionAge: number } {
  const u = unread(state, now);
  if (u.length === 0) return { unread: 0, editionAge: 0 };
  const oldest = Math.min(...u.map((l) => l.scheduledFor));
  const newer = new Set(state.editions.filter((e) => e.scheduledFor > oldest).map((e) => e.id));
  return { unread: u.length, editionAge: newer.size };
}

// Clicking the cat: everything in the pile is read; remember what it held, so the
// popover can tag it NEW until the next delivery.
export function clearPile(state: State, now: number): State {
  const u = unread(state, now);
  return { ...state, pileClearedAt: now, lastPile: u.length ? u.map((l) => l.key) : state.lastPile };
}

export const OPENED_TTL_MS = 7 * 24 * 3600_000;

export function markOpened(state: State, key: string, now: number): State {
  const opened = state.opened.filter((o) => o.key !== key && now - o.at < OPENED_TTL_MS);
  return { ...state, opened: [...opened, { key, at: now }] };
}

// --- the popover's front page --------------------------------------------------

export const FRONT_PAGE_MS = 24 * 3600_000; // rolling window (Rachel, 2026-11-09)
export const TOP_PER_TOPIC = 3;
export const MORE_PER_TOPIC = 3; // behind "Show more"

export type ViewItem = {
  key: string;
  headline: string;
  source: string;
  alsoIn: number; // other outlets running nearly the same headline ("+1 more")
  paywall: boolean;
  stamp: string; // when it was published: "8:30 AM", "Yest 9:53 PM", "Mon 6:10 PM"
  opened: boolean;
  fresh: boolean; // in the cat's pile: shown with a NEW tag
};
export type View = {
  nameplate: string; // the character's paper, e.g. "The Cloud Nine Chronicle"
  edition: string; // "Evening"
  dateLabel: string; // "Mon, Nov 9"
  newLabel: string | null; // "7 new"
  countLabel: string; // "15 stories"
  lead: (ViewItem & { topic: string; topicLabel: string }) | null; // the top story, in the All view
  chips: { id: string; label: string }[]; // "all" first
  filter: string;
  sections: { topic: string; label: string; items: ViewItem[]; more: ViewItem[] }[];
  fetchedLabel: string | null;
  empty: null | { title: string; body: string; action: "setup" | "refresh" | null };
  refreshing: boolean;
};

const SHORT: Record<string, string> = {
  "us-news": "US",
  "world-news": "World",
  "ai-tech": "AI",
  "creative-coding-devtools": "Code",
  "business-markets": "Business",
  science: "Science",
  "film-tv": "Film",
  music: "Music",
  gaming: "Games",
  sports: "Sports",
  "culture-books": "Books",
  design: "Design",
};

const dayStart = (t: number) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

// When a story was published, as a wire-service stamp (Rachel chose this, 2026-11-11):
// the time today, "Yest" and the time yesterday, else the weekday and the time.
export function stampFor(t: number, now: number, clock: (t: number) => string): string {
  const days = Math.round((dayStart(now) - dayStart(t)) / 86_400_000);
  if (days <= 0) return clock(t);
  if (days === 1) return `Yest ${clock(t)}`;
  return `${new Date(t).toLocaleDateString("en-US", { weekday: "short" })} ${clock(t)}`;
}

// What the cat brought most recently: the unread pile, plus what the pile held at
// your last click (you see it as you click him). Kept even after its feed drops it,
// for up to 48h.
function freshItems(state: State, now: number): Located[] {
  const last = new Set(state.lastPile);
  const pile = unread(state, now);
  const inPile = new Set(pile.map((l) => l.key));
  const clicked = allItems(state).filter((l) => last.has(l.key) && !inPile.has(l.key) && now - l.item.addedAt <= CARRY_OVER_MS);
  return [...pile, ...clicked];
}

// The outlet behind a link, so several feeds from one site count once:
// www.bbc.com and bbc.co.uk -> "bbc", feeds.npr.org -> "npr".
export function outletOf(link: string): string {
  try {
    const labels = new URL(link).hostname.toLowerCase().split(".").filter(Boolean);
    let i = labels.length - 2;
    if (i > 0 && labels[i].length <= 3 && labels[labels.length - 1].length === 2) i--; // co.uk, com.au
    return labels[Math.max(0, i)] ?? link;
  } catch {
    return link;
  }
}

// One story on the front page: the first headline seen for it, plus every outlet
// that ran the same link or nearly the same headline.
type Story = {
  item: Candidate;
  key: string;
  tokens: Set<string>;
  outlets: Set<string>;
  rank: number; // best position in a publisher's feed (0 = top); pile items count as 0
  fresh: boolean;
};

export type FrontPageOptions = {
  now: number;
  topics: { id: string; label: string }[]; // the user's topics, in their order
  sources: Source[]; // the sources the user approved, for the topics they picked
  keywords: string[];
  filter: string;
  editionTimes: EditionTimes;
  refreshing: boolean;
  clock: (t: number) => string; // formats a time: "Fetched …" and the story stamps
  nameplate?: string; // the newspaper's name (default: the cherub's)
};

function gatherStories(state: State, opts: FrontPageOptions): Story[] {
  const { now } = opts;
  const picked = new Set(opts.topics.map((t) => t.id));
  const topicOf = (ids: string[]) => opts.topics.find((t) => ids.includes(t.id))?.id;

  // New first, so a pile headline represents its story and keeps its NEW tag.
  const pile = freshItems(state, now)
    .filter((l) => picked.has(l.item.topic))
    .map((l) => ({ item: l.item as Candidate, rank: 0, fresh: true }));
  const feed = opts.sources.flatMap((s) => {
    const topic = topicOf(s.topics);
    if (!topic) return [];
    return (state.feeds[s.id]?.entries ?? []).flatMap((e, rank) =>
      now - e.publishedAt <= FRONT_PAGE_MS && e.publishedAt <= now + FUTURE_TOLERANCE_MS
        ? [{ item: { ...e, source: s.name, sourceId: s.id, topic, paywall: s.paywall }, rank, fresh: false }]
        : [],
    );
  });
  feed.sort((a, b) => b.item.publishedAt - a.item.publishedAt);

  const stories: Story[] = [];
  const byKey = new Map<string, Story>();
  for (const c of [...pile, ...feed]) {
    const key = urlKey(c.item.link);
    const tokens = headlineTokens(c.item.headline);
    const same = byKey.get(key) ?? stories.find((st) => isDuplicateHeadline(st.tokens, tokens));
    if (same) {
      same.outlets.add(outletOf(c.item.link));
      same.rank = Math.min(same.rank, c.rank);
      byKey.set(key, same);
      continue;
    }
    const story: Story = { item: c.item, key, tokens, outlets: new Set([outletOf(c.item.link)]), rank: c.rank, fresh: c.fresh };
    stories.push(story);
    byKey.set(key, story);
  }
  return stories;
}

// Within a topic: your keywords first, then stories more outlets carry,
// then the publisher's own order, then newest.
function rankStories(stories: Story[], keywords: string[]): Story[] {
  const kw = new Map(stories.map((s) => [s, keywordMatch(s.item.headline, keywords)]));
  return [...stories].sort(
    (a, b) =>
      Number(kw.get(b)) - Number(kw.get(a)) ||
      b.outlets.size - a.outlets.size ||
      a.rank - b.rank ||
      b.item.publishedAt - a.item.publishedAt,
  );
}

export function buildView(state: State, opts: FrontPageOptions & { hasSources: boolean }): View {
  const { now } = opts;
  const current = currentEdition(now, opts.editionTimes);
  const opened = new Set(state.opened.map((o) => o.key));

  const toItem = (st: Story): ViewItem => ({
    key: st.key,
    headline: st.item.headline,
    source: st.item.source,
    alsoIn: st.outlets.size - 1,
    paywall: st.item.paywall,
    stamp: stampFor(st.item.publishedAt, now, opts.clock),
    opened: opened.has(st.key),
    fresh: st.fresh,
  });

  const stories = gatherStories(state, opts);
  const picked = opts.topics
    .map((t) => {
      const ranked = rankStories(
        stories.filter((s) => s.item.topic === t.id),
        opts.keywords,
      );
      // The top 3, plus every new story (the cat never says "new" about something hidden).
      const shown = ranked.filter((s, i) => i < TOP_PER_TOPIC || s.fresh);
      return { t, shown: [...shown.filter((s) => s.fresh), ...shown.filter((s) => !s.fresh)], more: ranked.filter((s) => !shown.includes(s)).slice(0, MORE_PER_TOPIC) };
    })
    .filter((p) => p.shown.length > 0);

  const filter = opts.filter === "all" || opts.topics.some((t) => t.id === opts.filter) ? opts.filter : "all";
  // The All view leads with one top story: the best new one (most outlets, then the
  // user's topic order, then the publisher's order, then newest), else the best of
  // the rest. It moves out of its section.
  const topicIndex = new Map(opts.topics.map((t, i) => [t.id, i]));
  const leadStory =
    picked
      .flatMap((p) => p.shown)
      .sort(
        (a, b) =>
          Number(b.fresh) - Number(a.fresh) ||
          b.outlets.size - a.outlets.size ||
          (topicIndex.get(a.item.topic) ?? 0) - (topicIndex.get(b.item.topic) ?? 0) ||
          a.rank - b.rank ||
          b.item.publishedAt - a.item.publishedAt,
      )[0] ?? null;
  const lead = leadStory
    ? { ...toItem(leadStory), topic: leadStory.item.topic, topicLabel: opts.topics.find((t) => t.id === leadStory.item.topic)?.label ?? "" }
    : null;
  const sections = picked.map((p) => ({ topic: p.t.id, label: p.t.label, items: p.shown.map(toItem), more: p.more.map(toItem) }));
  const latestFetch = Math.max(0, ...Object.values(state.feeds).map((f) => f.lastSuccessAt ?? 0), ...state.editions.map((e) => e.fetchedAt));
  const total = sections.reduce((n, s) => n + s.items.length, 0);
  const fresh = sections.reduce((n, s) => n + s.items.filter((i) => i.fresh).length, 0);

  let empty: View["empty"] = null;
  if (!opts.hasSources) empty = { title: "No sources yet", body: "Pick a few sources and I'll start delivering headlines.", action: "setup" };
  else if (total === 0) empty = { title: "Nothing in the last 24 hours", body: "Your sources haven't posted anything recent. Try Refresh, or wait for the next edition.", action: "refresh" };

  const front = sections
    .map((s) => {
      if (!s.items.some((i) => i.key === lead?.key)) return s;
      // The lead's section moves its next story up from "Show more".
      return { ...s, items: [...s.items.filter((i) => i.key !== lead?.key), ...s.more.slice(0, 1)], more: s.more.slice(1) };
    })
    .filter((s) => s.items.length > 0);

  // Everything on the front page (the lead included), whichever topic is selected.
  const count = front.reduce((n, s) => n + s.items.length, 0) + (lead ? 1 : 0);

  return {
    nameplate: opts.nameplate ?? CHARACTER.paper,
    edition: current.slot === "morning" ? "Morning" : "Evening",
    dateLabel: new Date(current.scheduledFor).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
    newLabel: fresh > 0 ? `${fresh} new` : null,
    countLabel: `${count} ${count === 1 ? "story" : "stories"}`,
    lead: filter === "all" ? lead : null,
    // Chips only for topics with stories here (plus the selected one), so none lead nowhere.
    // Built-in topics get a short name; the user's own keep the name they typed.
    chips: [
      { id: "all", label: "All" },
      ...opts.topics
        .filter((t) => t.id === filter || sections.some((s) => s.topic === t.id))
        .map((t) => ({ id: t.id, label: SHORT[t.id] ?? t.label })),
    ],
    filter,
    sections: filter === "all" ? front : sections.filter((s) => s.topic === filter),
    fetchedLabel: latestFetch > 0 ? `Fetched ${opts.clock(latestFetch)}` : null,
    empty,
    refreshing: opts.refreshing,
  };
}

// The link behind a front-page story (from an edition or a feed), for opening it.
export function linkFor(state: State, key: string): string | null {
  for (const e of state.editions) for (const i of e.items) if (urlKey(i.link) === key) return i.link;
  for (const f of Object.values(state.feeds)) for (const e of f.entries) if (urlKey(e.link) === key) return e.link;
  return null;
}
