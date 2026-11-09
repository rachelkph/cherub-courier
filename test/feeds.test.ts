import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  type Deps,
  decodeBody,
  emptyCache,
  type FeedCache,
  fetchAll,
  fetchFeed,
  HOST_SPACING_MS,
  MAX_BYTES,
  MIN_REFETCH_MS,
  USER_AGENT,
} from "../src/main/feeds/client.ts";
import { buildEdition, type Source } from "../src/main/feeds/edition.ts";
import { FeedParseError, MAX_ENTRIES, parseFeed } from "../src/main/feeds/parse.ts";
import { isPrivateHost, plainText, safeUrl } from "../src/main/feeds/sanitize.ts";
import {
  type Candidate,
  DEFAULTS,
  dedupe,
  headlineTokens,
  isDuplicateHeadline,
  keywordMatch,
  selectEdition,
  similarity,
  urlKey,
} from "../src/main/feeds/select.ts";
import { emptyState, loadState, saveState } from "../src/main/feeds/store.ts";

const FIX = join(import.meta.dirname, "fixtures");
// Distinct three-word phrases, so generated headlines are not duplicates of each other.
const WORDS = "harbor violin glacier pepper rocket meadow lantern copper falcon orchid tundra walnut summit canyon ember quartz willow marble thistle cobalt saffron juniper basalt pelican cedar ripple bramble coral dune fjord".split(" ");
const phrase = (i: number) => `${WORDS[(3 * i) % 30]} ${WORDS[(3 * i + 1) % 30]} ${WORDS[(3 * i + 2) % 30]}`;
const fixture = (name: string) => readFile(join(FIX, name), "utf8");
const T = Date.parse("2026-11-08T18:00:00Z");
const H = 3600_000;

describe("parseFeed", () => {
  it("parses RSS 2.0, keeping only safe, dated, titled entries", async () => {
    const feed = parseFeed(await fixture("rss2.xml"), "https://example.com/feed.xml");
    assert.equal(feed.title, "Example & News");
    assert.deepEqual(
      feed.entries.map((e) => [e.headline, e.link]),
      [
        ["Plain bold headline", "https://example.com/a?utm_source=rss"],
        ["Escaped markup & entities’s", "https://example.com/relative/b"],
        ["Guid permalink only", "https://example.com/c"],
        ["Http link gets upgraded", "https://example.com/f"],
        ["Bidi spoof and tail", "https://example.com/g"],
      ],
    );
    // not-a-permalink guid, javascript:, no date, private address, blank title
    assert.equal(feed.skipped, 5);
    assert.equal(feed.entries[0].publishedAt, Date.parse("2026-11-08T10:00:00Z"));
    assert.equal(feed.entries[4].publishedAt, Date.parse("2026-11-08T09:00:00Z")); // 04:00 EST
  });

  it("parses Atom: alternate link, xml:base, published over updated, HTML titles", async () => {
    const feed = parseFeed(await fixture("atom.xml"), "https://atom.example.org/feed");
    assert.deepEqual(
      feed.entries.map((e) => [e.headline, e.link, new Date(e.publishedAt).toISOString()]),
      [
        ["Atom one", "https://atom.example.org/blog/posts/one", "2026-11-08T11:00:00.000Z"],
        ["Atom two", "https://atom.example.org/two", "2026-11-08T09:30:00.000Z"],
        ["Enclosure listed first", "https://atom.example.org/three", "2026-11-08T09:00:00.000Z"],
      ],
    );
  });

  it("parses RSS 1.0 (RDF)", async () => {
    const feed = parseFeed(await fixture("rdf.xml"));
    assert.equal(feed.entries.length, 1);
    assert.equal(feed.entries[0].link, "https://rdf.example.net/1");
  });

  it("rejects malformed XML and non-feeds with FeedParseError instead of crashing", async () => {
    const malformed = await fixture("malformed.xml");
    const html = await fixture("not-a-feed.html");
    assert.throws(() => parseFeed(""), FeedParseError);
    assert.throws(() => parseFeed(malformed), FeedParseError);
    assert.throws(() => parseFeed(html), FeedParseError);
    assert.throws(() => parseFeed("<rss><channel><item><title>x</title></item>"), FeedParseError);
  });

  it("never expands DOCTYPE entities (billion laughs)", async () => {
    const started = Date.now();
    const feed = parseFeed(await fixture("entity-bomb.xml"));
    assert.ok(Date.now() - started < 1000);
    assert.ok(!feed.entries[0].headline.includes("lollol"));
    assert.ok(feed.entries[0].headline.length < 40);
  });

  it(`caps entries at ${MAX_ENTRIES}`, () => {
    const items = Array.from({ length: MAX_ENTRIES + 50 }, (_, i) => `<item><title>Item ${i}</title><link>https://big.example.com/${i}</link><pubDate>Sun, 08 Nov 2026 10:00:00 GMT</pubDate></item>`).join("");
    const feed = parseFeed(`<rss><channel><title>Big</title>${items}</channel></rss>`);
    assert.equal(feed.entries.length, MAX_ENTRIES);
    assert.equal(feed.skipped, 50);
  });
});

describe("sanitize", () => {
  it("strips HTML, scripts, entities, invisible characters; caps length", () => {
    assert.equal(plainText("<p>Hi <a href='x'>there</a></p>"), "Hi there");
    assert.equal(plainText("a<script>steal()</script>b"), "a b");
    assert.equal(plainText("caf&eacute; &#x1F431; &#128008;"), "café 🐱 🐈");
    assert.equal(plainText("zero​width‮flip\u0007bell"), "zero width flip bell");
    assert.equal(plainText("x".repeat(400)).length, 300);
    assert.equal(plainText(42), "");
  });

  it("accepts only public http(s) links and upgrades http", () => {
    assert.equal(safeUrl("http://news.example.com/a"), "https://news.example.com/a");
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "ftp://x.com/a", "https://user:pw@x.com/", "http://localhost/a", "http://10.0.0.5/", "http://[::1]/", "http://printer.local/", "http://intranet/", "http://169.254.169.254/latest/meta-data"]) {
      assert.equal(safeUrl(bad), null, bad);
    }
    assert.ok(isPrivateHost("172.20.1.1"));
    assert.ok(!isPrivateHost("172.32.1.1"));
    assert.ok(isPrivateHost("::ffff:127.0.0.1"));
  });
});

const cand = (over: Partial<Candidate> & { headline: string }): Candidate => ({
  link: `https://n.example.com/${encodeURIComponent(over.headline)}`,
  publishedAt: T - H,
  source: "Src",
  sourceId: "src",
  topic: "us-news",
  paywall: false,
  ...over,
});
const opts = (over: Partial<Parameters<typeof selectEdition>[1]> = {}) => ({ now: T, ...DEFAULTS, keywords: [], exclude: new Set<string>(), ...over });

describe("dedupe", () => {
  it("normalizes URLs: tracking params, www, fragment, trailing slash", () => {
    assert.equal(urlKey("https://www.Example.com/a/?utm_source=x&id=2&fbclid=y#top"), urlKey("https://example.com/a?id=2"));
    assert.notEqual(urlKey("https://example.com/a?id=2"), urlKey("https://example.com/a?id=3"));
  });

  it("documents the headline threshold with examples", () => {
    const sim = (a: string, b: string) => similarity(headlineTokens(a), headlineTokens(b));
    const dup = (a: string, b: string) => isDuplicateHeadline(headlineTokens(a), headlineTokens(b));
    // Same story, cosmetic edits: duplicate
    assert.ok(dup("Seven dead and more than 100 injured after trains collide in Egypt", "Seven dead, more than 100 injured after trains collide in Egypt"));
    assert.ok(dup("Apple is racing to make Siri more agentic", "APPLE IS RACING TO MAKE SIRI MORE AGENTIC!"));
    // Same story reworded by another outlet (real BBC/NPR pair, 2026-11-08): Jaccard 7/11 = 0.64,
    // but 7 shared words covering 7/9 of the shorter headline -> duplicate by the second rule
    const bbc = "Nvidia launches investigation into CEO's affair with suspected Chinese spy";
    const npr = "Nvidia launches investigation into CEO's alleged relationship with Chinese spy";
    assert.ok(Math.abs(sim(bbc, npr) - 7 / 11) < 1e-9);
    assert.ok(dup(bbc, npr));
    // Related but different stories: kept
    assert.ok(!dup(bbc, "Here's the full text of Jensen Huang's memo to Nvidia"));
    assert.ok(!dup("Nvidia shares fall after earnings miss", "Nvidia shares rise after earnings beat"));
    // Fewer than 5 shared words never trips the second rule
    assert.ok(Math.abs(sim("Apple is racing to make Siri more agentic", "Apple races to make Siri agentic") - 4 / 7) < 1e-9);
    assert.ok(!dup("Apple is racing to make Siri more agentic", "Apple races to make Siri agentic"));
    // Short headlines must match exactly
    assert.ok(!dup("Markets rally", "Markets rally again"));
    assert.ok(dup("Markets rally", "markets: rally"));
  });

  it("drops later copies by URL or near-identical headline", () => {
    const items = [
      cand({ headline: "Seven dead and more than 100 injured after trains collide in Egypt", link: "https://bbc.example.com/1" }),
      cand({ headline: "Something else entirely different here today", link: "https://www.bbc.example.com/1/?utm_medium=rss" }),
      cand({ headline: "Seven dead, more than 100 injured after trains collide in Egypt", link: "https://npr.example.com/x" }),
      cand({ headline: "A new story about something else", link: "https://npr.example.com/y" }),
    ];
    assert.deepEqual(dedupe(items).map((i) => i.link), ["https://bbc.example.com/1", "https://npr.example.com/y"]);
  });
});

describe("selectEdition", () => {
  it("caps at 3 per topic and 7 total, newest first", () => {
    const items = ["us-news", "world-news", "ai-tech"].flatMap((topic, t) =>
      Array.from({ length: 5 }, (_, i) => cand({ headline: `${phrase(t * 5 + i)} ${topic}`, topic, publishedAt: T - (i * 3 + t) * 60_000 })),
    );
    const out = selectEdition(items, opts());
    assert.equal(out.length, 7);
    for (const t of ["us-news", "world-news", "ai-tech"]) assert.ok(out.filter((i) => i.topic === t).length <= 3);
    for (let i = 1; i < out.length; i++) assert.ok(out[i - 1].publishedAt >= out[i].publishedAt);
  });

  it("gives every topic a headline before filling, so small topics are not crowded out", () => {
    const busy = Array.from({ length: 10 }, (_, i) => cand({ headline: `${phrase(i)} busy`, topic: "ai-tech", publishedAt: T - i * 60_000 }));
    const quiet = ["us-news", "world-news", "film-tv", "music"].map((topic, i) => cand({ headline: `${topic} lone story with words`, topic, publishedAt: T - (20 + i) * H }));
    const out = selectEdition([...busy, ...quiet], opts());
    assert.equal(out.length, 7);
    assert.equal(out.filter((i) => i.topic === "ai-tech").length, 3);
    for (const t of ["us-news", "world-news", "film-tv", "music"]) assert.equal(out.filter((i) => i.topic === t).length, 1, t);
  });

  it("with more than 7 topics, every topic with news still gets a headline", () => {
    const topics = Array.from({ length: 12 }, (_, i) => `topic-${i}`);
    const items = topics.flatMap((topic, t) => Array.from({ length: 3 }, (_, i) => cand({ headline: `${phrase(t * 3 + i)} ${topic}`, topic, publishedAt: T - (t * 3 + i) * 60_000 })));
    const out = selectEdition(items, opts());
    assert.equal(out.length, 12);
    for (const t of topics) assert.equal(out.filter((i) => i.topic === t).length, 1, t);
    // Refreshing a full edition still adds a topic that had nothing yet.
    const taken = new Map(topics.slice(0, 11).map((t) => [t, 1]));
    const more = selectEdition(items, { ...opts(), total: 0, taken });
    assert.deepEqual(more.map((i) => i.topic), ["topic-11"]);
  });

  it("returns fewer than 7 when there is not enough", () => {
    const out = selectEdition([cand({ headline: "only one story here today" })], opts());
    assert.equal(out.length, 1);
  });

  it("respects the 48h window and drops far-future dates", () => {
    const items = [
      cand({ headline: "inside the window story here", publishedAt: T - 47 * H }),
      cand({ headline: "outside the window story here", publishedAt: T - 49 * H }),
      cand({ headline: "slightly future dated story ok", publishedAt: T + 30 * 60_000 }),
      cand({ headline: "far future dated story dropped", publishedAt: T + 5 * H }),
    ];
    assert.deepEqual(selectEdition(items, opts()).map((i) => i.headline).sort(), ["inside the window story here", "slightly future dated story ok"]);
  });

  it("skips headlines delivered in earlier editions", () => {
    const a = cand({ headline: "already delivered this morning story" });
    const b = cand({ headline: "brand new story this evening here" });
    assert.deepEqual(selectEdition([a, b], opts({ exclude: new Set([urlKey(a.link)]) })), [b]);
  });

  it("keywords boost within a topic but never filter", () => {
    const items = [
      cand({ headline: "Newest general tech story today", topic: "ai-tech", publishedAt: T - 1 * H }),
      cand({ headline: "Second general tech story today", topic: "ai-tech", publishedAt: T - 2 * H }),
      cand({ headline: "Third general tech story today", topic: "ai-tech", publishedAt: T - 3 * H }),
      cand({ headline: "Older story about Synthesizers and music gear", topic: "ai-tech", publishedAt: T - 10 * H }),
      cand({ headline: "A world story with no keyword", topic: "world-news", publishedAt: T - 20 * H }),
    ];
    const out = selectEdition(items, opts({ keywords: ["synthesizers"] }));
    assert.ok(out.some((i) => i.headline.includes("Synthesizers")), "keyword match makes the cut");
    assert.ok(out.some((i) => i.topic === "world-news"), "topic without matches still appears");
    assert.ok(keywordMatch("New open source synth released", ["open source"]));
    assert.ok(!keywordMatch("Opening sources say", ["open source"]));
  });
});

// --- HTTP client with a fake network -----------------------------------------

type Route = (req: { url: string; headers: Record<string, string> }) => Response | Promise<Response>;

function fakeDeps(routes: Record<string, Route>, opts: { private?: string[]; start?: number } = {}) {
  let now = opts.start ?? T;
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const sleeps: number[] = [];
  const deps: Deps = {
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    lookup: async (host) => ((opts.private ?? []).includes(host) ? ["127.0.0.1"] : ["93.184.216.34"]),
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url, headers });
      const route = routes[url];
      if (!route) throw new TypeError("fetch failed");
      return route({ url, headers });
    }) as typeof fetch,
  };
  return { deps, calls, sleeps, advance: (ms: number) => (now += ms) };
}

const RSS = `<rss><channel><title>Feed</title><item><title>Hello world headline</title><link>https://site.example.com/1</link><pubDate>Sun, 08 Nov 2026 17:00:00 GMT</pubDate></item></channel></rss>`;
const ok = (body = RSS, headers: Record<string, string> = {}) => new Response(body, { status: 200, headers: { "content-type": "application/rss+xml", ...headers } });

describe("fetchFeed", () => {
  const URL1 = "https://site.example.com/feed";

  it("sends an honest User-Agent, then a conditional GET; 304 keeps the entries", async () => {
    const { deps, calls, advance } = fakeDeps({
      [URL1]: ({ headers }) => (headers["If-None-Match"] === '"v1"' ? new Response(null, { status: 304 }) : ok(RSS, { etag: '"v1"', "last-modified": "Sun, 08 Nov 2026 17:00:00 GMT" })),
    });
    const first = await fetchFeed(emptyCache(URL1), deps);
    assert.equal(first.result, "fetched");
    assert.equal(calls[0].headers["User-Agent"], USER_AGENT);
    assert.equal(first.cache.entries.length, 1);
    assert.equal(first.cache.nextAllowedAt, T + MIN_REFETCH_MS);

    assert.equal((await fetchFeed(first.cache, deps)).result, "skipped", "inside the minimum refetch interval");
    assert.equal(calls.length, 1);

    advance(MIN_REFETCH_MS);
    const second = await fetchFeed(first.cache, deps);
    assert.equal(second.result, "not-modified");
    assert.equal(calls[1].headers["If-Modified-Since"], "Sun, 08 Nov 2026 17:00:00 GMT");
    assert.equal(second.cache.entries.length, 1);
  });

  it("backs off exponentially on network errors, capped at 24h", async () => {
    const { deps } = fakeDeps({});
    let cache: FeedCache = emptyCache(URL1);
    const waits: number[] = [];
    for (let i = 0; i < 9; i++) {
      const o = await fetchFeed(cache, deps, { force: true });
      assert.equal(o.result, "error");
      waits.push(o.cache.nextAllowedAt - T);
      cache = o.cache;
    }
    assert.deepEqual(waits.slice(0, 3), [BACKOFF_BASE_MS, 2 * BACKOFF_BASE_MS, 4 * BACKOFF_BASE_MS]);
    assert.equal(waits[8], BACKOFF_MAX_MS);
    assert.match(cache.lastError ?? "", /network error/);
  });

  it("honors Retry-After on 429", async () => {
    const { deps } = fakeDeps({ [URL1]: () => new Response("slow down", { status: 429, headers: { "retry-after": "7200" } }) });
    const o = await fetchFeed(emptyCache(URL1), deps);
    assert.equal(o.cache.nextAllowedAt, T + 2 * H);
  });

  it("marks 404/410 as gone and waits a day", async () => {
    const { deps } = fakeDeps({ [URL1]: () => new Response("", { status: 410 }) });
    const o = await fetchFeed(emptyCache(URL1), deps);
    assert.equal(o.cache.status, "gone");
    assert.equal(o.cache.nextAllowedAt, T + BACKOFF_MAX_MS);
  });

  it("follows public redirects, remembering only permanent ones", async () => {
    const moved = "https://new.example.com/feed";
    const temp = "https://cdn.example.com/feed";
    const { deps } = fakeDeps({
      [URL1]: () => new Response(null, { status: 301, headers: { location: moved } }),
      [moved]: () => ok(),
      "https://t.example.com/feed": () => new Response(null, { status: 302, headers: { location: temp } }),
      [temp]: () => ok(),
    });
    assert.equal((await fetchFeed(emptyCache(URL1), deps)).cache.fetchUrl, moved);
    assert.equal((await fetchFeed(emptyCache("https://t.example.com/feed"), deps)).cache.fetchUrl, "https://t.example.com/feed");
  });

  it("refuses redirects and DNS answers that point into the local network", async () => {
    const { deps, calls } = fakeDeps(
      {
        [URL1]: () => new Response(null, { status: 302, headers: { location: "http://192.168.0.1/admin" } }),
        "https://rebind.example.com/feed": () => ok(),
      },
      { private: ["rebind.example.com"] },
    );
    const a = await fetchFeed(emptyCache(URL1), deps);
    assert.equal(a.cache.status, "gone");
    assert.match(a.cache.lastError ?? "", /refused/);
    const b = await fetchFeed(emptyCache("https://rebind.example.com/feed"), deps);
    assert.match(b.cache.lastError ?? "", /private address/);
    assert.ok(!calls.some((c) => c.url.includes("rebind")), "never connected");
  });

  it("caps response size", async () => {
    const { deps } = fakeDeps({
      [URL1]: () => ok(RSS, { "content-length": String(MAX_BYTES + 1) }),
      "https://stream.example.com/feed": () => new Response(new ReadableStream({
        pull(c) {
          c.enqueue(new Uint8Array(1024 * 1024));
        },
      }), { status: 200 }),
    });
    assert.match((await fetchFeed(emptyCache(URL1), deps)).cache.lastError ?? "", /too large/);
    assert.match((await fetchFeed(emptyCache("https://stream.example.com/feed"), deps)).cache.lastError ?? "", /too large/);
  });

  it("tries https first for http feeds, falling back to http", async () => {
    const { deps, calls } = fakeDeps({ "http://plain.example.com/rss": () => ok() });
    const o = await fetchFeed(emptyCache("http://plain.example.com/rss"), deps);
    assert.deepEqual(calls.map((c) => c.url), ["https://plain.example.com/rss", "http://plain.example.com/rss"]);
    assert.equal(o.result, "fetched");
    assert.equal(o.cache.fetchUrl, "http://plain.example.com/rss");
  });

  it("decodes declared charsets", () => {
    const bytes = new Uint8Array([...new TextEncoder().encode('<?xml version="1.0" encoding="windows-1252"?><t>caf'), 0xe9, ...new TextEncoder().encode("</t>")]);
    assert.match(decodeBody(bytes, "text/xml"), /café/);
    assert.match(decodeBody(new TextEncoder().encode("<t>café</t>"), "text/xml; charset=utf-8"), /café/);
  });
});

describe("fetchAll", () => {
  it("isolates bad feeds and spaces requests to the same host", async () => {
    const { deps, sleeps } = fakeDeps({
      "https://a.example.com/1": () => ok(),
      "https://a.example.com/2": () => ok("<rss><channel><item>broken"),
      "https://b.example.com/1": () => ok(),
    });
    const out = await fetchAll(
      ["https://a.example.com/1", "https://a.example.com/2", "https://b.example.com/1", "https://down.example.com/x"].map((u, i) => ({ id: `f${i}`, cache: emptyCache(u) })),
      deps,
    );
    assert.equal(out.get("f0")?.result, "fetched");
    assert.equal(out.get("f1")?.result, "error");
    assert.match(out.get("f1")?.cache.lastError ?? "", /not a valid feed/);
    assert.equal(out.get("f2")?.result, "fetched");
    assert.equal(out.get("f3")?.result, "error");
    assert.deepEqual(sleeps, [HOST_SPACING_MS], "one pause between the two a.example.com requests");
  });
});

describe("store", () => {
  it("round-trips, writes owner-only, re-sanitizes on load, sets corrupt files aside", async () => {
    const dir = await mkdtemp(join(tmpdir(), "newscat-"));
    const path = join(dir, "state.json");
    assert.deepEqual(await loadState(path), emptyState());

    const s = emptyState();
    s.editions.push({ id: "e1", slot: "evening", scheduledFor: T, fetchedAt: T, items: [{ ...cand({ headline: "kept headline here" }), addedAt: T }] });
    await saveState(path, s);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.deepEqual(await loadState(path), s);

    const tampered = JSON.parse(await readFile(path, "utf8"));
    tampered.editions[0].items.push({ ...tampered.editions[0].items[0], link: "javascript:alert(1)" });
    tampered.editions[0].items.push({ ...tampered.editions[0].items[0], headline: "<img src=x onerror=alert(1)>Clean", link: "https://n.example.com/z" });
    await writeFile(path, JSON.stringify(tampered));
    const loaded = await loadState(path);
    assert.deepEqual(loaded.editions[0].items.map((i) => i.headline), ["kept headline here", "Clean"]);

    await writeFile(path, "{not json");
    assert.deepEqual(await loadState(path, 123), emptyState());
    assert.ok((await stat(`${path}.corrupt-123`)).isFile());
  });
});

describe("buildEdition", () => {
  const sources: Source[] = [
    { id: "a", name: "A News", feedUrl: "https://a.example.com/rss", topics: ["us-news"], paywall: false },
    { id: "b", name: "B Tech", feedUrl: "https://b.example.com/rss", topics: ["ai-tech"], paywall: true },
    { id: "c", name: "C Music", feedUrl: "https://c.example.com/rss", topics: ["music"], paywall: false },
  ];
  const feed = (host: string, n: number, hoursAgo = 1) =>
    `<rss><channel><title>${host}</title>${Array.from({ length: n }, (_, i) => `<item><title>${phrase(host.charCodeAt(0) * 4 + i)} ${host}</title><link>https://${host}/${i}</link><pubDate>${new Date(T - (hoursAgo + i) * H).toUTCString()}</pubDate></item>`).join("")}</channel></rss>`;

  it("builds an edition from enabled topics and does not repeat delivered headlines", async () => {
    const { deps, advance } = fakeDeps({
      "https://a.example.com/rss": () => ok(feed("a.example.com", 4)),
      "https://b.example.com/rss": () => ok(feed("b.example.com", 4)),
      "https://c.example.com/rss": () => ok(feed("c.example.com", 4)),
    });
    const req = { sources, topics: ["us-news", "ai-tech"], keywords: [], slot: "morning" as const, scheduledFor: T };
    const first = await buildEdition(req, emptyState(), deps);
    assert.equal(first.edition.items.length, 6); // 3 + 3; music not enabled
    assert.ok(first.edition.items.every((i) => i.topic !== "music"));
    assert.ok(first.edition.items.filter((i) => i.sourceId === "b").every((i) => i.paywall));
    assert.equal(first.edition.id, "2026-11-08-morning");

    advance(MIN_REFETCH_MS);
    const second = await buildEdition({ ...req, slot: "evening", scheduledFor: T + 10 * H }, first.state, deps);
    assert.equal(second.edition.items.length, 2, "only the 4th story of each feed is new");
    assert.equal(second.state.editions.length, 2);
  });
});
