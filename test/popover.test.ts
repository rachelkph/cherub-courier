import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Deps } from "../src/main/feeds/client.ts";
import { buildEdition, type Source } from "../src/main/feeds/edition.ts";
import { urlKey } from "../src/main/feeds/select.ts";
import { type Edition, type EditionItem, emptyState, type State } from "../src/main/feeds/store.ts";
import { anchorPopover } from "../src/main/popover/anchor.ts";
import { buildView, catInputs, clearPile, editionNote, markOpened, unread } from "../src/main/popover/view.ts";
import { currentEdition } from "../src/main/schedule.ts";

const H = 3600_000;
const local = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const TIMES = { morning: "08:00", evening: "18:00" };

describe("currentEdition", () => {
  it("picks the most recent scheduled edition in local time", () => {
    assert.deepEqual(currentEdition(local(2026, 11, 8, 9, 30), TIMES), { slot: "morning", scheduledFor: local(2026, 11, 8, 8) });
    assert.deepEqual(currentEdition(local(2026, 11, 8, 18, 0), TIMES), { slot: "evening", scheduledFor: local(2026, 11, 8, 18) });
    assert.deepEqual(currentEdition(local(2026, 11, 9, 2, 0), TIMES), { slot: "evening", scheduledFor: local(2026, 11, 8, 18) }, "2 AM is last night's edition");
    assert.deepEqual(currentEdition(local(2026, 11, 8, 7, 0), { morning: "06:30", evening: "21:15" }), { slot: "morning", scheduledFor: local(2026, 11, 8, 6, 30) });
  });
});

const item = (n: number, topic: string, addedAt: number, over: Partial<EditionItem> = {}): EditionItem => ({
  headline: `Headline number ${n} about ${topic}`,
  link: `https://n.example.com/${topic}/${n}`,
  publishedAt: addedAt - H,
  source: "Src",
  sourceId: "src",
  topic,
  paywall: false,
  addedAt,
  ...over,
});
const edition = (id: string, slot: "morning" | "evening", at: number, items: EditionItem[]): Edition => ({ id, slot, scheduledFor: at, fetchedAt: at, items });

const M8 = local(2026, 11, 8, 8);
const E8 = local(2026, 11, 8, 18);
const M9 = local(2026, 11, 9, 8);
function threeEditions(): State {
  return {
    ...emptyState(),
    editions: [
      edition("m8", "morning", M8, [item(1, "us-news", M8), item(2, "music", M8), item(3, "ai-tech", M8)]),
      edition("e8", "evening", E8, [item(4, "us-news", E8), item(5, "ai-tech", E8)]),
      edition("m9", "morning", M9, [item(6, "us-news", M9), item(7, "music", M9)]),
    ],
  };
}

describe("pile", () => {
  it("counts unread across editions and how old the oldest is", () => {
    const s = threeEditions();
    assert.deepEqual(catInputs(s, M9 + H), { unread: 7, editionAge: 2 }, "loafing: oldest unread is 2 editions back");
    const s4 = { ...s, editions: [...s.editions, edition("e9", "evening", M9 + 10 * H, [item(8, "music", M9 + 10 * H)])] };
    assert.deepEqual(catInputs(s4, M9 + 11 * H), { unread: 8, editionAge: 3 }, "asleep: more than 2 editions");
  });

  it("drops headlines older than 48h from the pile", () => {
    assert.equal(unread(threeEditions(), M8 + 49 * H).length, 4, "the 8 Nov morning edition expired");
  });

  it("clicking the cat clears the pile but remembers it for the popover", () => {
    const s = clearPile(threeEditions(), M9 + H);
    assert.deepEqual(catInputs(s, M9 + 2 * H), { unread: 0, editionAge: 0 });
    assert.equal(s.lastPile.length, 7);
    const later = { ...s, editions: [...s.editions, edition("e9", "evening", M9 + 10 * H, [item(8, "music", M9 + 10 * H)])] };
    assert.deepEqual(catInputs(later, M9 + 11 * H), { unread: 1, editionAge: 0 }, "only the new edition is unread");
  });
});

describe("popover view", () => {
  const topics = [
    { id: "us-news", label: "US news" },
    { id: "ai-tech", label: "AI and tech" },
    { id: "music", label: "Music" },
  ];
  const view = (s: State, now: number, filter = "all", hasSources = true) =>
    buildView(s, { now, topics, filter, editionTimes: TIMES, hasSources, refreshing: false, clock: () => "8:05 AM" });

  it("groups the pile by topic in the user's order, newest edition first, with notes on older ones", () => {
    const v = view(threeEditions(), M9 + H);
    assert.equal(v.masthead, "The Morning Edition");
    assert.equal(v.dateLabel, "Monday, November 9");
    assert.equal(v.countLabel, "7 new");
    assert.deepEqual(v.sections.map((s) => s.topic), ["us-news", "ai-tech", "music"]);
    assert.deepEqual(v.sections[0].items.map((i) => [i.headline, i.note]), [
      ["Headline number 6 about us-news", null],
      ["Headline number 4 about us-news", "last night"],
      ["Headline number 1 about us-news", "yesterday morning"],
    ]);
    assert.equal(v.fetchedLabel, "Fetched 8:05 AM");
  });

  it("still lists the headlines after the cat is clicked, and dims opened ones", () => {
    let s = clearPile(threeEditions(), M9 + H);
    s = markOpened(s, urlKey("https://n.example.com/music/7"), M9 + H);
    const v = view(s, M9 + 2 * H);
    assert.equal(v.countLabel, "7 headlines");
    const music = v.sections.find((x) => x.topic === "music");
    assert.deepEqual(music?.items.map((i) => i.opened), [true, false]);
  });

  it("filters to one topic and falls back to All for unknown filters", () => {
    assert.deepEqual(view(threeEditions(), M9 + H, "music").sections.map((s) => s.topic), ["music"]);
    assert.equal(view(threeEditions(), M9 + H, "sports").filter, "all");
    assert.deepEqual(view(threeEditions(), M9 + H).chips.map((c) => c.label), ["All", "US", "AI", "Music"]);
    const s = { ...threeEditions(), editions: threeEditions().editions.map((e) => ({ ...e, items: e.items.filter((i) => i.topic !== "ai-tech") })) };
    assert.deepEqual(view(s, M9 + H).chips.map((c) => c.label), ["All", "US", "Music"], "no chip for a topic with nothing in it");
  });

  it("explains empty states", () => {
    assert.equal(view(emptyState(), M9, "all", false).empty?.action, "setup");
    const none = view(emptyState(), M9);
    assert.equal(none.empty?.action, "refresh");
    assert.equal(none.masthead, "The Morning Edition", "named after the current edition time");
  });

  it("names older editions", () => {
    assert.equal(editionNote("morning", M9, M9 + 3 * H), "this morning");
    assert.equal(editionNote("evening", E8, M9 + H), "last night");
    assert.equal(editionNote("morning", M8, local(2026, 11, 10, 9)), "Sunday morning");
  });
});

describe("Refresh adds to the current edition", () => {
  const sources: Source[] = [{ id: "a", name: "A", feedUrl: "https://a.example.com/rss", topics: ["us-news"], paywall: false }];
  const WORDS = "harbor violin glacier pepper rocket meadow lantern copper falcon orchid tundra walnut summit canyon ember quartz".split(" ");
  const rss = (n: number, at: number) =>
    `<rss><channel>${Array.from({ length: n }, (_, i) => `<item><title>${WORDS[i]} ${WORDS[(i + 5) % 16]} ${WORDS[(i + 9) % 16]} story</title><link>https://a.example.com/${i}</link><pubDate>${new Date(at - i * 60_000).toUTCString()}</pubDate></item>`).join("")}</channel></rss>`;

  it("keeps earlier headlines, adds new ones, and respects the per-topic cap", async () => {
    let now = M9 + H;
    let body = rss(2, now);
    const deps: Deps = {
      now: () => now,
      sleep: async () => {},
      lookup: async () => ["93.184.216.34"],
      fetch: (async () => new Response(body, { status: 200 })) as unknown as typeof fetch,
    };
    const req = { sources, topics: ["us-news"], keywords: [], slot: "morning" as const, scheduledFor: M9, force: true };
    const first = await buildEdition(req, emptyState(), deps);
    assert.equal(first.edition.items.length, 2);
    now += H;
    body = rss(6, now);
    const second = await buildEdition(req, first.state, deps);
    assert.equal(second.state.editions.length, 1, "same edition");
    assert.equal(second.edition.items.length, 3, "max 3 per topic");
    assert.deepEqual(second.edition.items.slice(0, 2), first.edition.items, "earlier headlines kept");
    assert.equal(second.edition.items[2].addedAt, now);
  });
});

describe("anchorPopover", () => {
  const work = { x: 0, y: 33, width: 1470, height: 858 }; // menu bar on top, Dock at the bottom
  const want = { width: 380, height: 600 };
  const catAt = (x: number) => ({ x, y: work.y + work.height - 58, width: 63, height: 58 });

  it("centers above the cat", () => {
    const { bounds, tailX } = anchorPopover(catAt(700), want, work);
    assert.ok(Math.abs(bounds.x + bounds.width / 2 - (700 + 31.5)) <= 0.5, "centered on the cat");
    assert.equal(bounds.y + bounds.height, catAt(700).y - 2);
    assert.equal(tailX, 190);
  });

  it("stays on screen at both edges, tail still pointing at the cat", () => {
    const left = anchorPopover(catAt(0), want, work);
    assert.equal(left.bounds.x, 8);
    assert.equal(left.tailX, 24); // cat center 31.5 - 8, rounded
    const right = anchorPopover(catAt(1470 - 63), want, work);
    assert.equal(right.bounds.x + right.bounds.width, 1470 - 8);
    assert.equal(right.tailX, Math.round(1407 + 31.5 - right.bounds.x), "tail over the cat's center");
    assert.ok(right.tailX <= 380 - 18);
  });

  it("respects a side Dock and a short screen", () => {
    const sideDock = { x: 47, y: 33, width: 1423, height: 923 };
    assert.equal(anchorPopover({ x: 47, y: 898, width: 63, height: 58 }, want, sideDock).bounds.x, 55);
    const short = { x: 0, y: 25, width: 1024, height: 500 };
    const { bounds } = anchorPopover({ x: 400, y: 467, width: 63, height: 58 }, want, short);
    assert.ok(bounds.y >= short.y + 8, "below the menu bar");
    assert.ok(bounds.height < 600, "shrunk to fit");
  });
});
