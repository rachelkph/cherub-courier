import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Deps } from "../src/main/feeds/client.ts";
import { buildEdition, type Source } from "../src/main/feeds/edition.ts";
import { urlKey } from "../src/main/feeds/select.ts";
import { type Edition, type EditionItem, emptyState, type State } from "../src/main/feeds/store.ts";
import { anchorPopover } from "../src/main/popover/anchor.ts";
import { buildView, catInputs, clearPile, editionNote, linkFor, markOpened, outletOf, unread } from "../src/main/popover/view.ts";
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

describe("popover front page", () => {
  const topics = [
    { id: "us-news", label: "US news" },
    { id: "ai-tech", label: "AI and tech" },
    { id: "music", label: "Music" },
  ];
  const src = (id: string, topic: string): Source => ({ id, name: id.toUpperCase(), feedUrl: `https://${id}.example.com/rss`, topics: [topic], paywall: false });
  const SOURCES = [src("npr", "us-news"), src("bbc", "us-news"), src("verge", "ai-tech"), src("bb", "music")];
  // Distinct words so unrelated test headlines never look like the same story.
  const W = "harbor violin glacier pepper rocket meadow lantern copper falcon orchid tundra walnut summit canyon ember quartz".split(" ");
  const words = (n: number) => `${W[n % 16]} ${W[(n * 7 + 3) % 16]} ${W[(n * 5 + 1) % 16]} story ${n}`;
  const entry = (sourceId: string, n: number, publishedAt: number, headline = words(n)) => ({ headline, link: `https://${sourceId}.example/${n}`, publishedAt });
  const withFeeds = (s: State, feeds: Record<string, ReturnType<typeof entry>[]>, at: number): State => ({
    ...s,
    feeds: Object.fromEntries(Object.entries(feeds).map(([id, entries]) => [id, { url: `https://${id}.example.com/rss`, entries, status: "ok" as const, failures: 0, nextAllowedAt: 0, lastSuccessAt: at }])),
  });
  const view = (s: State, now: number, over: Partial<Parameters<typeof buildView>[1]> = {}) =>
    buildView(s, { now, topics, sources: SOURCES, keywords: [], filter: "all", editionTimes: TIMES, hasSources: true, refreshing: false, clock: () => "8:05 AM", ...over });
  const delivered = (sourceId: string, n: number, publishedAt: number, topic: string, addedAt: number): EditionItem => ({ ...entry(sourceId, n, publishedAt), source: sourceId.toUpperCase(), sourceId, topic, paywall: false, addedAt });

  // Monday 9 Nov, 9 AM. Last night's edition (seen: the cat was clicked at 10 PM) and
  // this morning's (new). The feeds still list some of last night's stories.
  function monday(): State {
    let s: State = {
      ...emptyState(),
      editions: [
        edition("e8", "evening", E8, [delivered("npr", 1, E8 - H, "us-news", E8), delivered("verge", 2, E8 - 2 * H, "ai-tech", E8)]),
        edition("m9", "morning", M9, [delivered("npr", 3, M9 - H, "us-news", M9), delivered("bb", 4, M9 - H, "music", M9)]),
      ],
    };
    s = { ...s, pileClearedAt: E8 + 4 * H };
    return withFeeds(
      s,
      {
        npr: [entry("npr", 3, M9 - H), entry("npr", 1, E8 - H), entry("npr", 5, E8 - 3 * H)],
        verge: [entry("verge", 2, E8 - 2 * H)],
        bb: [entry("bb", 4, M9 - H), entry("bb", 6, M9 - 30 * H)], // 6 is older than 24 h
      },
      M9,
    );
  }

  it("keeps seen stories while they are still current, with NEW on what the cat just brought", () => {
    const v = view(monday(), M9 + H);
    assert.equal(v.masthead, "The Morning Edition");
    assert.equal(v.dateLabel, "Monday, November 9");
    assert.equal(v.newLabel, "2 new");
    assert.equal(v.countLabel, "5 top stories");
    assert.deepEqual(v.sections.map((s) => s.topic), ["us-news", "ai-tech", "music"]);
    assert.deepEqual(v.sections[0].items.map((i) => [i.headline, i.fresh, i.note]), [
      [words(3), true, null],
      [words(1), false, "last night"],
      [words(5), false, "yesterday afternoon"], // never delivered: named after when it was published (3 PM)
    ]);
    assert.deepEqual(v.sections[2].items.map((i) => i.headline), [words(4)], "older than 24 hours: gone");
    assert.equal(v.fetchedLabel, "Fetched 8:05 AM");
  });

  it("clicking the cat (which opens the popover) keeps NEW on what he brought until his next delivery", () => {
    const s = markOpened(clearPile(monday(), M9 + H), urlKey("https://bb.example/4"), M9 + H);
    const v = view(s, M9 + 2 * H);
    assert.equal(v.newLabel, "2 new");
    assert.equal(v.countLabel, "5 top stories");
    assert.equal(v.sections[2].items[0].opened, true, "opened ones dim");
    // The evening edition arrives and is clicked: only its headline is new now.
    const E9 = M9 + 10 * H;
    let next: State = { ...s, editions: [...s.editions, edition("e9", "evening", E9, [delivered("npr", 7, E9 - H, "us-news", E9)])] };
    next = withFeeds(next, { npr: [entry("npr", 7, E9 - H), entry("npr", 3, M9 - H)], bb: [entry("bb", 4, M9 - H)] }, E9);
    next = clearPile(next, E9 + 60_000);
    const ve = view(next, E9 + H);
    assert.equal(ve.newLabel, "1 new");
    assert.deepEqual(ve.sections[0].items.map((i) => [i.headline, i.fresh, i.note]), [
      [words(7), true, null],
      [words(3), false, "this morning"],
    ]);
  });

  it("a seen story leaves when its publisher drops it or it turns 24 hours old; an unseen one waits for the click", () => {
    const s = monday();
    const dropped = { ...s, feeds: { ...s.feeds, verge: { ...s.feeds.verge, entries: [] } } };
    assert.ok(!view(dropped, M9 + H).sections.some((x) => x.topic === "ai-tech"), "seen and no longer in the feed");
    assert.ok(!view(s, E8 - H + 24 * H + 60_000).sections[0].items.some((i) => i.headline === words(1)), "24 hours after publishing");
    // This morning's headlines are unseen: still shown 30 hours later, even though the feeds dropped them.
    const later = { ...s, feeds: {} };
    const v = view(later, M9 + 30 * H);
    assert.deepEqual(v.sections.flatMap((x) => x.items.map((i) => [i.headline, i.fresh])), [
      [words(3), true],
      [words(4), true],
    ]);
  });

  it("shows the top 3 per topic, every new story, and up to 3 more behind Show more", () => {
    const feed = Array.from({ length: 8 }, (_, i) => entry("npr", 10 + i, M9 - (i + 1) * 60_000));
    const pile = [delivered("bbc", 30, M9 - 5 * H, "us-news", M9), delivered("bbc", 31, M9 - 6 * H, "us-news", M9)];
    const s = withFeeds({ ...emptyState(), editions: [edition("m9", "morning", M9, pile)] }, { npr: feed }, M9);
    const us = view(s, M9 + H).sections[0];
    assert.deepEqual(us.items.map((i) => i.headline), [words(30), words(31), words(10)], "new first, filled to 3");
    assert.deepEqual(us.more.map((i) => i.headline), [words(11), words(12), words(13)]);
    // More new stories than 3: all of them show, plus NPR's top story, which ranks in the top 3.
    const many = Array.from({ length: 5 }, (_, i) => delivered("bbc", 70 + i, M9 - (i + 1) * H, "us-news", M9));
    const s5 = withFeeds({ ...emptyState(), editions: [edition("m9", "morning", M9, many)] }, { npr: feed }, M9);
    assert.deepEqual(view(s5, M9 + H).sections[0].items.map((i) => i.headline), [...many.map((i) => i.headline), words(10)]);
  });

  it("ranks by how many sources carry a story, then the publisher's order, then newest; keywords first", () => {
    const same = "Senate passes stopgap funding bill hours before shutdown deadline";
    const s = withFeeds(
      emptyState(),
      {
        npr: [entry("npr", 40, M9 - 3 * H), entry("npr", 41, M9 - H, same), entry("npr", 42, M9 - 2 * H)],
        bbc: [entry("bbc", 51, M9 - 26 * H), entry("bbc", 50, M9 - 4 * H, `${same} vote`)], // 51 is past 24 h; the shared story is second
      },
      M9,
    );
    const v = view(s, M9 + H);
    assert.deepEqual(v.sections[0].items.map((i) => [i.headline, i.alsoIn]), [
      [same, 1], // carried by NPR and BBC
      [words(40), 0], // NPR's top item, though older than 42
      [words(42), 0],
    ]);
    // Two feeds from one outlet are not extra coverage.
    const bbcTwice = withFeeds(emptyState(), { npr: [entry("npr", 43, M9 - H)], bbc: [{ ...entry("bbc", 44, M9 - 2 * H), link: "https://www.bbc.com/news/1" }], bbc2: [{ ...entry("bbc", 44, M9 - 2 * H), link: "https://www.bbc.co.uk/news/1?at_medium=RSS" }] }, M9);
    const twice = view(bbcTwice, M9 + H, { sources: [...SOURCES, src("bbc2", "us-news")] }).sections[0].items;
    assert.deepEqual(twice.map((i) => [i.headline, i.alsoIn]), [[words(43), 0], [words(44), 0]]);
    assert.equal(outletOf("https://feeds.npr.org/1001/rss.xml"), "npr");
    const kw = view(s, M9 + H, { keywords: [W[42 % 16]] });
    assert.equal(kw.sections[0].items[0].headline, words(42), "a keyword match goes first");
  });

  it("only uses approved sources for picked topics", () => {
    const s = withFeeds(emptyState(), { npr: [entry("npr", 60, M9)], rogue: [entry("rogue", 61, M9)] }, M9);
    assert.deepEqual(view(s, M9 + H, { sources: [] }).sections, []);
    assert.deepEqual(view(s, M9 + H, { topics: [{ id: "music", label: "Music" }] }).sections, []);
    assert.deepEqual(view(s, M9 + H).sections.flatMap((x) => x.items.map((i) => i.headline)), [words(60)]);
  });

  it("filters to one topic, falls back to All for unknown filters, and has no chips for empty topics", () => {
    assert.deepEqual(view(monday(), M9 + H, { filter: "music" }).sections.map((s) => s.topic), ["music"]);
    assert.equal(view(monday(), M9 + H, { filter: "sports" }).filter, "all");
    assert.deepEqual(view(monday(), M9 + H).chips.map((c) => c.label), ["All", "US", "AI", "Music"]);
    const noAi = { ...monday(), feeds: { ...monday().feeds, verge: { ...monday().feeds.verge, entries: [] } } };
    assert.deepEqual(view(noAi, M9 + H).chips.map((c) => c.label), ["All", "US", "Music"]);
  });

  it("explains empty states", () => {
    assert.equal(view(emptyState(), M9, { hasSources: false }).empty?.action, "setup");
    const none = view(emptyState(), M9);
    assert.equal(none.empty?.title, "Nothing in the last 24 hours");
    assert.equal(none.masthead, "The Morning Edition", "named after the current edition time");
  });

  it("names older editions, and finds the link behind any story", () => {
    assert.equal(editionNote("morning", M9, M9 + 3 * H), "this morning");
    assert.equal(editionNote("evening", E8, M9 + H), "last night");
    assert.equal(editionNote("morning", M8, local(2026, 11, 10, 9)), "Sunday morning");
    assert.equal(linkFor(monday(), urlKey("https://npr.example/5")), "https://npr.example/5", "a feed story never delivered");
    assert.equal(linkFor(monday(), urlKey("https://bb.example/4")), "https://bb.example/4");
    assert.equal(linkFor(monday(), "evil.example.com/x"), null);
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
