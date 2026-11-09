// RSS 2.0, RSS 1.0 (RDF) and Atom to a flat list of entries. Never throws on
// odd content; throws FeedParseError when the document is not a feed at all.

import { XMLParser, XMLValidator } from "fast-xml-parser";
import { plainText, safeUrl } from "./sanitize.ts";

export type ParsedEntry = { headline: string; link: string; publishedAt: number };
export type ParsedFeed = {
  title: string;
  entries: ParsedEntry[];
  skipped: number; // entries dropped for a missing/invalid title, link or date
};

export class FeedParseError extends Error {}

export const MAX_ENTRIES = 200; // a feed with more (e.g. a full archive) is truncated

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  processEntities: false, // DOCTYPE entities are never expanded; see sanitize.decodeEntities
  htmlEntities: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  removeNSPrefix: false,
  isArray: (name) => ["item", "entry", "link", "rdf:li"].includes(name),
});

type Node = Record<string, unknown>;

const asNode = (v: unknown): Node | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Node) : null);
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined ? [] : [v]);

// Text content of an element that may be a string, or an object with #text.
function text(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  const n = asNode(v);
  if (n && typeof n["#text"] === "string") return n["#text"];
  if (n && typeof n["#text"] === "number") return String(n["#text"]);
  return "";
}

export function parseDate(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  let t = Date.parse(s);
  if (Number.isNaN(t)) {
    // RFC 822 variants Date.parse rejects: "Sun, 8 Nov 2026 10:00:00 EST" is fine,
    // but "Sun, 08 Nov 2026 10:00 +0000 (UTC)" or a stray trailing zone name is not.
    t = Date.parse(s.replace(/\s*\([^)]*\)\s*$/, "").replace(/\s+[A-Z]{3,5}$/, " GMT"));
  }
  return Number.isNaN(t) ? null : t;
}

function atomLink(entry: Node, base: string | undefined): string | null {
  const links = asList(entry.link).map(asNode).filter((l): l is Node => l !== null);
  const alt = links.find((l) => (l["@_rel"] ?? "alternate") === "alternate" && (!l["@_type"] || String(l["@_type"]).includes("html")));
  const pick = alt ?? links.find((l) => (l["@_rel"] ?? "alternate") === "alternate") ?? links[0];
  return pick ? safeUrl(pick["@_href"], base) : null;
}

function rssLink(item: Node, base: string | undefined): string | null {
  for (const l of asList(item.link)) {
    const u = safeUrl(text(l), base);
    if (u) return u;
  }
  const guid = item.guid;
  const g = asNode(guid);
  const permalink = g ? g["@_isPermaLink"] !== "false" : typeof guid === "string";
  return permalink ? safeUrl(text(guid), base) : null;
}

export function parseFeed(xml: string, feedUrl?: string): ParsedFeed {
  if (typeof xml !== "string" || !xml.trim()) throw new FeedParseError("empty response");
  const valid = XMLValidator.validate(xml);
  if (valid !== true) throw new FeedParseError(`not well-formed XML: ${valid.err.msg} (line ${valid.err.line})`);

  let doc: Node;
  try {
    doc = parser.parse(xml) as Node;
  } catch (e) {
    throw new FeedParseError(`could not parse XML: ${(e as Error).message}`);
  }

  let title = "";
  let raw: { headline: unknown; link: string | null; date: string }[] = [];

  const rss = asNode(doc.rss);
  const atom = asNode(doc.feed);
  const rdf = asNode(doc["rdf:RDF"]);
  if (rss) {
    const channel = asNode(rss.channel) ?? {};
    const base = feedUrl;
    title = text(channel.title);
    raw = asList(channel.item).map(asNode).filter((i): i is Node => i !== null).map((i) => ({
      headline: text(i.title),
      link: rssLink(i, base),
      date: text(i.pubDate) || text(i["dc:date"]) || text(i.updated) || text(i.published),
    }));
  } else if (atom) {
    const base = typeof atom["@_xml:base"] === "string" ? safeUrl(atom["@_xml:base"], feedUrl) ?? feedUrl : feedUrl;
    title = text(atom.title);
    raw = asList(atom.entry).map(asNode).filter((e): e is Node => e !== null).map((e) => ({
      headline: text(e.title),
      link: atomLink(e, base),
      date: text(e.published) || text(e.updated) || text(e.issued) || text(e.modified),
    }));
  } else if (rdf) {
    title = text(asNode(rdf.channel)?.title);
    raw = asList(rdf.item).map(asNode).filter((i): i is Node => i !== null).map((i) => ({
      headline: text(i.title),
      link: rssLink(i, feedUrl),
      date: text(i["dc:date"]) || text(i.pubDate),
    }));
  } else {
    throw new FeedParseError("not an RSS or Atom feed");
  }

  const entries: ParsedEntry[] = [];
  let skipped = 0;
  for (const r of raw.slice(0, MAX_ENTRIES)) {
    const headline = plainText(r.headline);
    const publishedAt = parseDate(r.date);
    if (!headline || !r.link || publishedAt === null) {
      skipped++;
      continue;
    }
    entries.push({ headline, link: r.link, publishedAt });
  }
  skipped += Math.max(0, raw.length - MAX_ENTRIES);
  return { title: plainText(title, 120), entries, skipped };
}
