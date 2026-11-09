// Checks a link the user pasted during setup. A feed is validated and its newest
// headline returned as proof; a web page is searched only for the feed links it
// advertises (<link rel="alternate" type="application/rss+xml|atom+xml">). No
// scraping of page content.

import { type Deps, fetchText } from "../feeds/client.ts";
import { FeedParseError, parseFeed } from "../feeds/parse.ts";
import { isPrivateHost, plainText, safeFeedUrl } from "../feeds/sanitize.ts";

export const NO_FEED_MESSAGE = "We couldn't find a feed for this site.";
export const MAX_PAGE_BYTES = 2 * 1024 * 1024;
export const MAX_CANDIDATES = 3;
// Where sites usually keep their feed, tried in order when a page advertises none
// (e.g. Ars Technica: /feed/, Polygon: /rss/index.xml).
export const COMMON_FEED_PATHS = ["/feed/", "/rss/index.xml", "/rss.xml", "/feed.xml", "/rss/", "/atom.xml", "/index.xml"];

export type LinkCheck =
  | { kind: "feed"; feedUrl: string; title: string; latestHeadline: string | null; discovered: boolean }
  | { kind: "none"; message: string }
  | { kind: "invalid"; message: string };

// Accepts "example.com" as well as full URLs.
export function normalizeInput(input: string): string | null {
  const t = input.trim();
  if (!t || t.length > 2048 || /\s/.test(t)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  return safeFeedUrl(withScheme);
}

// Feed links live in <head>, which can be hundreds of KB of inline scripts and
// styles (The Hollywood Reporter's link sits ~280 KB in), so scan all of it
// (the page is already capped at MAX_PAGE_BYTES), minus script and style blocks.
export function feedLinks(html: string, pageUrl: string): string[] {
  const end = html.search(/<\/head\s*>/i);
  const head = (end === -1 ? html : html.slice(0, end)).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  const out: string[] = [];
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const attr = (name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))?.slice(1).find((v) => v !== undefined);
    const rel = (attr("rel") ?? "").toLowerCase().split(/\s+/);
    const type = (attr("type") ?? "").toLowerCase();
    const href = attr("href");
    if (!rel.includes("alternate") || !href) continue;
    if (!/application\/(rss|atom)\+xml|application\/rdf\+xml/.test(type)) continue;
    try {
      const u = safeFeedUrl(new URL(plainText(href, 2048), pageUrl).toString());
      if (u && !out.includes(u)) out.push(u);
    } catch {
      // ignore unparseable hrefs
    }
  }
  return out;
}

function looksLikeHtml(body: string, contentType: string): boolean {
  return /html/i.test(contentType) || /^\s*(<!doctype html|<html)/i.test(body);
}

async function tryFeed(url: string, deps: Deps, discovered: boolean): Promise<LinkCheck | null> {
  const res = await fetchText(url, deps);
  if (res.status !== 200) return null;
  try {
    const feed = parseFeed(res.body, res.finalUrl);
    const newest = [...feed.entries].sort((a, b) => b.publishedAt - a.publishedAt)[0];
    return { kind: "feed", feedUrl: url, title: feed.title || new URL(url).hostname, latestHeadline: newest?.headline ?? null, discovered };
  } catch (e) {
    if (e instanceof FeedParseError) return null;
    throw e;
  }
}

export async function checkLink(input: string, deps: Deps): Promise<LinkCheck> {
  const url = normalizeInput(input);
  if (!url) {
    try {
      const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
      if (isPrivateHost(u.hostname)) return { kind: "invalid", message: "Local and private network addresses can't be used." };
    } catch {
      // fall through
    }
    return { kind: "invalid", message: "That doesn't look like a web address. Paste a link starting with https://" };
  }

  let res: Awaited<ReturnType<typeof fetchText>>;
  try {
    res = await fetchText(url, deps, { maxBytes: MAX_PAGE_BYTES, accept: "application/rss+xml, application/atom+xml, text/html;q=0.8, */*;q=0.5" });
  } catch (e) {
    const msg = (e as Error).message;
    if (/private address|refused/i.test(msg)) return { kind: "invalid", message: "Local and private network addresses can't be used." };
    return { kind: "none", message: `We couldn't reach that address (${msg}).` };
  }
  if (res.status !== 200) return { kind: "none", message: NO_FEED_MESSAGE };

  try {
    const feed = parseFeed(res.body, res.finalUrl);
    const newest = [...feed.entries].sort((a, b) => b.publishedAt - a.publishedAt)[0];
    return { kind: "feed", feedUrl: url, title: feed.title || new URL(url).hostname, latestHeadline: newest?.headline ?? null, discovered: false };
  } catch (e) {
    if (!(e instanceof FeedParseError)) throw e;
  }

  if (!looksLikeHtml(res.body, res.contentType)) return { kind: "none", message: NO_FEED_MESSAGE };
  const advertised = feedLinks(res.body, res.finalUrl).slice(0, MAX_CANDIDATES);
  const origin = new URL(res.finalUrl).origin;
  const guesses = COMMON_FEED_PATHS.map((p) => `${origin}${p}`).filter((u) => !advertised.includes(u));
  for (const candidate of [...advertised, ...guesses]) {
    try {
      const found = await tryFeed(candidate, deps, true);
      if (found) return found;
    } catch {
      // try the next one
    }
  }
  return { kind: "none", message: NO_FEED_MESSAGE };
}
