// A polite feed client: honest User-Agent, conditional GET, timeouts, a size cap,
// back-off on errors, Retry-After, spacing between requests to the same host, and
// manual redirects where every hop (and its resolved address) must be public.

import { lookup as dnsLookup } from "node:dns/promises";
import { APP_NAME } from "../../shared/config.ts";
import { FeedParseError, type ParsedEntry, parseFeed } from "./parse.ts";
import { isPrivateAddress, safeFeedUrl } from "./sanitize.ts";

// Name, purpose and a contact link, the usual form for automated clients. (A longer
// phrase, "fetches only feeds its user subscribed to", got us blocked by npr.org.)
export const USER_AGENT = `${APP_NAME}/0.1 (macOS desktop RSS reader; +https://github.com/rachelkph/news-sprite)`;
export const TIMEOUT_MS = 15_000;
export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_REDIRECTS = 5;
export const MIN_REFETCH_MS = 30 * 60_000; // never refetch one feed more often, even on Refresh
export const BACKOFF_BASE_MS = 15 * 60_000;
export const BACKOFF_MAX_MS = 24 * 3600_000;
export const HOST_SPACING_MS = 2_000;
export const MAX_PARALLEL_HOSTS = 4;
const FEED_ACCEPT = "application/rss+xml, application/atom+xml, application/rdf+xml;q=0.9, application/xml;q=0.8, text/xml;q=0.8, */*;q=0.1";

export type FeedCache = {
  url: string; // the feed URL as configured
  fetchUrl?: string; // where it was last fetched from (https upgrade / permanent redirect)
  etag?: string;
  lastModified?: string;
  title?: string;
  entries: ParsedEntry[];
  status: "ok" | "error" | "gone" | "new";
  lastError?: string;
  lastSuccessAt?: number;
  failures: number;
  nextAllowedAt: number;
};

export type FetchOutcome = {
  cache: FeedCache;
  result: "fetched" | "not-modified" | "skipped" | "error";
};

export type Deps = {
  fetch: typeof fetch;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  lookup: (host: string) => Promise<string[]>; // resolved IP addresses
};

export const realDeps: Deps = {
  fetch: (input, init) => fetch(input, init),
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  lookup: async (host) => (await dnsLookup(host, { all: true })).map((a) => a.address),
};

export function emptyCache(url: string): FeedCache {
  return { url, entries: [], status: "new", failures: 0, nextAllowedAt: 0 };
}

class FetchError extends Error {
  retryAfterMs?: number;
  gone = false;
  constructor(message: string, opts: { retryAfterMs?: number; gone?: boolean } = {}) {
    super(message);
    this.retryAfterMs = opts.retryAfterMs;
    this.gone = opts.gone ?? false;
  }
}

function retryAfter(header: string | null, now: number): number | undefined {
  if (!header) return undefined;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(header);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

async function assertPublic(url: string, deps: Deps): Promise<URL> {
  const checked = safeFeedUrl(url);
  if (!checked) throw new FetchError(`refused URL (not public http/https): ${url}`, { gone: true });
  const u = new URL(checked);
  let addrs: string[];
  try {
    addrs = await deps.lookup(u.hostname.replace(/^\[|\]$/g, ""));
  } catch {
    throw new FetchError(`could not resolve ${u.hostname}`);
  }
  if (addrs.length === 0 || addrs.some(isPrivateAddress)) throw new FetchError(`refused ${u.hostname}: resolves to a private address`, { gone: true });
  return u;
}

async function readCapped(res: Response, maxBytes = MAX_BYTES): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length"));
  if (declared > maxBytes) throw new FetchError(`response too large (${declared} bytes)`);
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new FetchError(`response too large (over ${maxBytes} bytes)`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

export function decodeBody(bytes: Uint8Array, contentType: string | null): string {
  const fromHeader = contentType?.match(/charset="?([\w-]+)/i)?.[1];
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 200));
  const fromXml = head.match(/<\?xml[^>]*encoding=["']([\w-]+)["']/i)?.[1];
  for (const label of [fromHeader, fromXml, "utf-8"]) {
    if (!label) continue;
    try {
      return new TextDecoder(label).decode(bytes);
    } catch {
      // unknown label: try the next one
    }
  }
  return new TextDecoder().decode(bytes);
}

type Conditional = { forUrl?: string; etag?: string; lastModified?: string };

// One GET with manual redirects. Returns the final response and URL.
async function get(url: string, cond: Conditional, deps: Deps, accept = FEED_ACCEPT): Promise<{ res: Response; finalUrl: string; permanent: boolean }> {
  let current = url;
  let permanent = true;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = await assertPublic(current, deps);
    const headers: Record<string, string> = { "User-Agent": USER_AGENT, Accept: accept };
    if (cond.forUrl === current) {
      if (cond.etag) headers["If-None-Match"] = cond.etag;
      if (cond.lastModified) headers["If-Modified-Since"] = cond.lastModified;
    }
    let res: Response;
    try {
      res = await deps.fetch(u.toString(), { headers, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      const err = e as Error;
      throw new FetchError(err.name === "TimeoutError" ? `timed out after ${TIMEOUT_MS / 1000}s` : `network error: ${err.message}`);
    }
    if (res.status >= 300 && res.status < 400 && res.status !== 304) {
      const loc = res.headers.get("location");
      await res.body?.cancel();
      if (!loc) throw new FetchError(`redirect ${res.status} without a location`);
      if (res.status !== 301 && res.status !== 308) permanent = false;
      current = new URL(loc, current).toString();
      continue;
    }
    return { res, finalUrl: current, permanent };
  }
  throw new FetchError(`more than ${MAX_REDIRECTS} redirects`);
}

export async function fetchFeed(cache: FeedCache, deps: Deps, opts: { force?: boolean } = {}): Promise<FetchOutcome> {
  const now = deps.now();
  if (!opts.force && now < cache.nextAllowedAt) return { cache, result: "skipped" };

  // http feeds: try https first, remember whichever works.
  const configured = cache.url;
  const candidates = cache.fetchUrl ? [cache.fetchUrl] : configured.startsWith("http://") ? [configured.replace(/^http:/, "https:"), configured] : [configured];

  let lastError: FetchError | null = null;
  for (const url of candidates) {
    try {
      const { res, finalUrl, permanent } = await get(url, { forUrl: cache.fetchUrl ?? cache.url, etag: cache.etag, lastModified: cache.lastModified }, deps);
      if (res.status === 304) {
        await res.body?.cancel();
        return {
          result: "not-modified",
          cache: { ...cache, status: "ok", lastError: undefined, failures: 0, lastSuccessAt: now, nextAllowedAt: now + MIN_REFETCH_MS },
        };
      }
      if (res.status === 404 || res.status === 410) {
        await res.body?.cancel();
        throw new FetchError(`HTTP ${res.status}`, { gone: true });
      }
      if (res.status === 429 || res.status === 503) {
        await res.body?.cancel();
        throw new FetchError(`HTTP ${res.status}`, { retryAfterMs: retryAfter(res.headers.get("retry-after"), now) });
      }
      if (res.status !== 200) {
        await res.body?.cancel();
        throw new FetchError(`HTTP ${res.status}`);
      }
      const body = decodeBody(await readCapped(res), res.headers.get("content-type"));
      const feed = parseFeed(body, finalUrl);
      return {
        result: "fetched",
        cache: {
          url: configured,
          fetchUrl: permanent ? finalUrl : url,
          etag: res.headers.get("etag") ?? undefined,
          lastModified: res.headers.get("last-modified") ?? undefined,
          title: feed.title || cache.title,
          entries: feed.entries,
          status: "ok",
          lastSuccessAt: now,
          failures: 0,
          nextAllowedAt: now + MIN_REFETCH_MS,
        },
      };
    } catch (e) {
      lastError = e instanceof FetchError ? e : new FetchError(e instanceof FeedParseError ? `not a valid feed: ${e.message}` : String((e as Error).message ?? e));
      if (lastError.retryAfterMs !== undefined) break; // the server answered; do not try the http fallback
    }
  }

  const err = lastError as FetchError;
  const failures = cache.failures + 1;
  const backoff = err.gone ? BACKOFF_MAX_MS : Math.min(BACKOFF_BASE_MS * 2 ** (failures - 1), BACKOFF_MAX_MS);
  const wait = Math.min(Math.max(backoff, err.retryAfterMs ?? 0), BACKOFF_MAX_MS);
  return {
    result: "error",
    cache: { ...cache, status: err.gone ? "gone" : "error", lastError: err.message, failures, nextAllowedAt: now + wait },
  };
}

export type TextResponse =
  | { status: 304; finalUrl: string }
  | { status: 200; finalUrl: string; body: string; contentType: string; etag?: string; lastModified?: string };

// GET any public URL as text, with the same safety rules as feeds (public hosts
// only, manual redirects, timeout, size cap). Non-200/304 responses throw.
export async function fetchText(
  url: string,
  deps: Deps,
  opts: { maxBytes?: number; accept?: string; etag?: string; lastModified?: string } = {},
): Promise<TextResponse> {
  const { res, finalUrl } = await get(url, { forUrl: url, etag: opts.etag, lastModified: opts.lastModified }, deps, opts.accept ?? FEED_ACCEPT);
  if (res.status === 304) {
    await res.body?.cancel();
    return { status: 304, finalUrl };
  }
  if (res.status !== 200) {
    await res.body?.cancel();
    throw new FetchError(`HTTP ${res.status}`, { gone: res.status === 404 || res.status === 410 });
  }
  const contentType = res.headers.get("content-type") ?? "";
  const body = decodeBody(await readCapped(res, opts.maxBytes ?? MAX_BYTES), contentType);
  return { status: 200, finalUrl, body, contentType, etag: res.headers.get("etag") ?? undefined, lastModified: res.headers.get("last-modified") ?? undefined };
}

export type FeedJob = { id: string; cache: FeedCache };

// Fetch many feeds: one at a time per host with spacing, a few hosts in parallel.
// A failing feed never affects the others.
export async function fetchAll(jobs: FeedJob[], deps: Deps, opts: { force?: boolean } = {}): Promise<Map<string, FetchOutcome>> {
  const byHost = new Map<string, FeedJob[]>();
  for (const j of jobs) {
    let host: string;
    try {
      host = new URL(j.cache.fetchUrl ?? j.cache.url).hostname;
    } catch {
      host = `invalid:${j.id}`;
    }
    byHost.set(host, [...(byHost.get(host) ?? []), j]);
  }
  const out = new Map<string, FetchOutcome>();
  const queues = [...byHost.values()];
  const worker = async () => {
    for (let q = queues.shift(); q; q = queues.shift()) {
      for (let i = 0; i < q.length; i++) {
        if (i > 0) await deps.sleep(HOST_SPACING_MS);
        const job = q[i];
        try {
          out.set(job.id, await fetchFeed(job.cache, deps, opts));
        } catch (e) {
          out.set(job.id, { result: "error", cache: { ...job.cache, status: "error", lastError: String(e), failures: job.cache.failures + 1, nextAllowedAt: deps.now() + BACKOFF_BASE_MS } });
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL_HOSTS, queues.length) }, worker));
  return out;
}
