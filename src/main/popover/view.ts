// What the cat's pile holds and what the popover shows. Pure functions over the
// stored state, so restarts, Refresh and the 48h carry-over behave the same.

import type { EditionItem, State } from "../feeds/store.ts";
import { urlKey } from "../feeds/select.ts";
import { currentEdition, type EditionTimes } from "../schedule.ts";

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

// Clicking the cat: everything in the pile is read; remember what it held.
export function clearPile(state: State, now: number): State {
  const u = unread(state, now);
  return { ...state, pileClearedAt: now, lastPile: u.length ? u.map((l) => l.key) : state.lastPile };
}

export const OPENED_TTL_MS = 7 * 24 * 3600_000;

export function markOpened(state: State, key: string, now: number): State {
  const opened = state.opened.filter((o) => o.key !== key && now - o.at < OPENED_TTL_MS);
  return { ...state, opened: [...opened, { key, at: now }] };
}

// --- the popover's view ------------------------------------------------------------

export type ViewItem = { key: string; headline: string; source: string; paywall: boolean; note: string | null; opened: boolean };
export type View = {
  masthead: string;
  dateLabel: string;
  countLabel: string;
  chips: { id: string; label: string }[]; // "all" first
  filter: string;
  sections: { topic: string; label: string; items: ViewItem[] }[];
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

// "this morning", "last night", "Friday evening"…
export function editionNote(slot: "morning" | "evening", scheduledFor: number, now: number): string {
  const days = Math.round((dayStart(now) - dayStart(scheduledFor)) / 86_400_000);
  if (days <= 0) return slot === "morning" ? "this morning" : "this evening";
  if (days === 1) return slot === "morning" ? "yesterday morning" : "last night";
  return `${new Date(scheduledFor).toLocaleDateString("en-US", { weekday: "long" })} ${slot}`;
}

export function buildView(
  state: State,
  opts: {
    now: number;
    topics: { id: string; label: string }[]; // the user's topics, in their order
    filter: string;
    editionTimes: EditionTimes;
    hasSources: boolean;
    refreshing: boolean;
    clock: (t: number) => string; // formats a time for "Fetched …"
  },
): View {
  const { now } = opts;
  const pile = unread(state, now);
  const everything = allItems(state);
  const remembered = new Set(state.lastPile);
  const shown =
    pile.length > 0
      ? pile
      : remembered.size > 0
        ? everything.filter((l) => remembered.has(l.key))
        : (() => {
            const latest = [...state.editions].sort((a, b) => b.scheduledFor - a.scheduledFor)[0];
            return latest ? everything.filter((l) => l.scheduledFor === latest.scheduledFor) : [];
          })();

  const newest = shown.length ? Math.max(...shown.map((l) => l.scheduledFor)) : null;
  const edition = newest === null ? currentEdition(now, opts.editionTimes) : { slot: shown.find((l) => l.scheduledFor === newest)?.slot ?? "morning", scheduledFor: newest };
  const opened = new Set(state.opened.map((o) => o.key));

  const sections = opts.topics
    .map((t) => ({
      topic: t.id,
      label: t.label,
      items: shown
        .filter((l) => l.item.topic === t.id)
        .sort((a, b) => b.scheduledFor - a.scheduledFor || b.item.publishedAt - a.item.publishedAt)
        .map((l) => ({
          key: l.key,
          headline: l.item.headline,
          source: l.item.source,
          paywall: l.item.paywall,
          note: l.scheduledFor === newest ? null : editionNote(l.slot, l.scheduledFor, now),
          opened: opened.has(l.key),
        })),
    }))
    .filter((s) => s.items.length > 0);

  const filter = opts.filter === "all" || opts.topics.some((t) => t.id === opts.filter) ? opts.filter : "all";
  const latestFetch = state.editions.length ? Math.max(...state.editions.map((e) => e.fetchedAt)) : null;
  const count = shown.length;

  let empty: View["empty"] = null;
  if (!opts.hasSources) empty = { title: "No sources yet", body: "Pick a few sources and I'll start delivering headlines.", action: "setup" };
  else if (count === 0) empty = { title: "Nothing to deliver yet", body: "No new headlines from your sources. Try Refresh, or wait for the next edition.", action: "refresh" };

  return {
    masthead: edition.slot === "morning" ? "The Morning Edition" : "The Evening Edition",
    dateLabel: new Date(edition.scheduledFor).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
    countLabel: pile.length > 0 ? `${count} new` : `${count} headline${count === 1 ? "" : "s"}`,
    // Chips only for topics with headlines here (plus the selected one), so none lead nowhere.
    chips: [
      { id: "all", label: "All" },
      ...opts.topics
        .filter((t) => t.id === filter || sections.some((s) => s.topic === t.id))
        .map((t) => ({ id: t.id, label: SHORT[t.id] ?? t.label.split(" ")[0] })),
    ],
    filter,
    sections: filter === "all" ? sections : sections.filter((s) => s.topic === filter),
    fetchedLabel: latestFetch === null ? null : `Fetched ${opts.clock(latestFetch)}`,
    empty,
    refreshing: opts.refreshing,
  };
}
