// Turning many feed entries into one edition. Pure functions, no I/O. No AI:
// newest first, topic caps, simple word-overlap duplicate detection.

export type Candidate = {
  headline: string;
  link: string;
  publishedAt: number; // ms since epoch
  source: string; // display name
  sourceId: string;
  topic: string; // topic id
  paywall: boolean;
};

export type SelectOptions = {
  now: number;
  windowHours: number; // items older than this are ignored (default 48)
  perTopic: number; // max headlines per topic (3)
  total: number; // max headlines per edition (7)
  keywords: string[]; // boost, see keywordMatch
  exclude: Set<string>; // urlKeys already delivered in earlier editions
  taken?: Map<string, number>; // headlines per topic already in this edition (Refresh adds to it)
};

export const DEFAULTS = { windowHours: 48, perTopic: 3, total: 7 } as const;

// Feeds sometimes post-date items by a few minutes; beyond this they are dropped.
export const FUTURE_TOLERANCE_MS = 60 * 60 * 1000;

// Same article despite tracking parameters, fragments, www., trailing slashes.
export function urlKey(link: string): string {
  try {
    const u = new URL(link);
    const params = [...u.searchParams]
      .filter(([k]) => !/^(utm_|fbclid$|gclid$|mc_|ref$|ref_src$|cmpid$|smid$|taid$)/i.test(k))
      .sort(([a], [b]) => a.localeCompare(b));
    const query = params.length ? `?${new URLSearchParams(params).toString()}` : "";
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    return `${host}${u.pathname.replace(/\/+$/, "")}${query}`;
  } catch {
    return link;
  }
}

const STOPWORDS = new Set(["a", "an", "the", "of", "to", "in", "on", "for", "and", "or", "is", "are", "at", "by", "with", "as", "from", "its", "it", "be"]);

export function headlineTokens(headline: string): Set<string> {
  const words = headline
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0 && !STOPWORDS.has(w));
  return new Set(words);
}

// Duplicate rules, on word sets that skip a small stopword list:
// 1. near-identical: Jaccard similarity >= 0.8 (re-posts, wire copies with tiny edits)
// 2. same story reworded: at least 5 shared words that make up >= 75% of the shorter
//    headline (e.g. BBC "...CEO's affair with suspected Chinese spy" vs NPR "...CEO's
//    alleged relationship with Chinese spy": 7 shared of 9)
// Headlines with fewer than 4 words must match exactly. Related stories sharing a
// few names ("Nvidia shares fall after earnings miss" / "...rise after earnings beat",
// 4 shared) are kept apart.
export const DUPLICATE_THRESHOLD = 0.8;
export const SAME_STORY_MIN_SHARED = 5;
export const SAME_STORY_COVERAGE = 0.75;
const MIN_FUZZY_WORDS = 4;

function shared(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n;
}

export function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const both = shared(a, b);
  return both / (a.size + b.size - both);
}

export function isDuplicateHeadline(a: Set<string>, b: Set<string>): boolean {
  if (a.size < MIN_FUZZY_WORDS || b.size < MIN_FUZZY_WORDS) return a.size === b.size && similarity(a, b) === 1;
  if (similarity(a, b) >= DUPLICATE_THRESHOLD) return true;
  const both = shared(a, b);
  return both >= SAME_STORY_MIN_SHARED && both / Math.min(a.size, b.size) >= SAME_STORY_COVERAGE;
}

// Keeps the first of each duplicate group, so pass candidates newest first.
export function dedupe(items: Candidate[]): Candidate[] {
  const seenUrls = new Set<string>();
  const kept: { item: Candidate; tokens: Set<string> }[] = [];
  for (const item of items) {
    const key = urlKey(item.link);
    if (seenUrls.has(key)) continue;
    const tokens = headlineTokens(item.headline);
    if (kept.some((k) => isDuplicateHeadline(k.tokens, tokens))) continue;
    seenUrls.add(key);
    kept.push({ item, tokens });
  }
  return kept.map((k) => k.item);
}

// Keywords boost, they do not filter: within a topic, headlines containing any
// keyword (whole word, case-insensitive) come first, then the rest, newest first.
// A topic is never emptied because nothing matched.
export function keywordMatch(headline: string, keywords: string[]): boolean {
  if (keywords.length === 0) return false;
  const words = headlineTokens(headline);
  const text = ` ${[...words].join(" ")} `;
  return keywords.some((k) => {
    const kw = [...headlineTokens(k)];
    if (kw.length === 0) return false;
    return kw.length === 1 ? words.has(kw[0]) : text.includes(` ${kw.join(" ")} `);
  });
}

export function cleanKeywords(raw: string[]): string[] {
  return [...new Set(raw.map((k) => k.trim().slice(0, 40)).filter((k) => headlineTokens(k).size > 0))].slice(0, 20);
}

// 1. keep items inside the age window (and not far in the future), not delivered before
// 2. drop duplicates
// 3. per topic: keyword matches first, then newest
// 4. every topic with news gets its best headline, even past `total`, so no
//    subscribed topic is crowded out (decided by Rachel 2026-11-08: no limit on
//    topics); then fill to `total` with the newest remaining, never more than
//    `perTopic` from one topic
// Returned newest first.
export function selectEdition(candidates: Candidate[], opts: SelectOptions): Candidate[] {
  const oldest = opts.now - opts.windowHours * 3600 * 1000;
  const fresh = candidates
    .filter((c) => c.publishedAt >= oldest && c.publishedAt <= opts.now + FUTURE_TOLERANCE_MS)
    .filter((c) => !opts.exclude.has(urlKey(c.link)))
    .sort((a, b) => b.publishedAt - a.publishedAt);
  const unique = dedupe(fresh);

  const byTopic = new Map<string, Candidate[]>();
  for (const c of unique) {
    const list = byTopic.get(c.topic) ?? [];
    list.push(c);
    byTopic.set(c.topic, list);
  }
  for (const list of byTopic.values()) {
    list.sort((a, b) => Number(keywordMatch(b.headline, opts.keywords)) - Number(keywordMatch(a.headline, opts.keywords)) || b.publishedAt - a.publishedAt);
  }

  const picked: Candidate[] = [];
  const count = new Map<string, number>(opts.taken ?? []);
  const take = (c: Candidate) => {
    picked.push(c);
    count.set(c.topic, (count.get(c.topic) ?? 0) + 1);
  };

  const leaders = [...byTopic.values()].map((l) => l[0]).sort((a, b) => b.publishedAt - a.publishedAt);
  for (const c of leaders) {
    const n = count.get(c.topic) ?? 0;
    if (n === 0 || (picked.length < opts.total && n < opts.perTopic)) take(c);
  }

  // Fill in each topic's own order (keyword matches first), interleaved newest first.
  const queues = new Map([...byTopic].map(([t, l]) => [t, l.filter((c) => !picked.includes(c))]));
  while (picked.length < opts.total) {
    let best: Candidate | null = null;
    for (const [topic, q] of queues) {
      if (q.length === 0 || (count.get(topic) ?? 0) >= opts.perTopic) continue;
      if (!best || q[0].publishedAt > best.publishedAt) best = q[0];
    }
    if (!best) break;
    (queues.get(best.topic) as Candidate[]).shift();
    take(best);
  }
  return picked.sort((a, b) => b.publishedAt - a.publishedAt);
}
