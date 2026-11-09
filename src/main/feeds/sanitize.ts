// Everything from a feed is untrusted. Text is reduced to plain, short, single-line
// strings; URLs must be public http(s). The renderer still escapes text when it
// displays it; this is the first of two layers.

import { isIP } from "node:net";

export const MAX_HEADLINE_CHARS = 300;

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  laquo: "«", raquo: "»", bull: "•", middot: "·", copy: "©", reg: "®", trade: "™",
  eacute: "é", egrave: "è", aacute: "á", agrave: "à", iacute: "í", oacute: "ó", uacute: "ú",
  ntilde: "ñ", ouml: "ö", uuml: "ü", auml: "ä", ccedil: "ç", euro: "€", pound: "£", deg: "°",
};

// Standard and numeric entities only; DOCTYPE-declared entities are never expanded.
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z][a-z0-9]{1,8});/gi, (whole, ent: string) => {
    if (ent[0] === "#") {
      const code = ent[1] === "x" || ent[1] === "X" ? Number.parseInt(ent.slice(2), 16) : Number.parseInt(ent.slice(1), 10);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : "";
    }
    return NAMED[ent.toLowerCase()] ?? whole;
  });
}

// Control characters, zero-width characters and bidi overrides (used for spoofing).
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g;

// Plain text from a feed field that may contain HTML (escaped or not) and entities.
export function plainText(raw: unknown, max = MAX_HEADLINE_CHARS): string {
  if (typeof raw !== "string") return "";
  let s = raw;
  // Two rounds: titles are often entity-escaped HTML ("&lt;b&gt;").
  for (let i = 0; i < 2; i++) {
    s = s.replace(/<!\[CDATA\[|\]\]>/g, "");
    s = s.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
    s = s.replace(/<[^>]*>/g, " ");
    s = decodeEntities(s);
  }
  s = s.replace(/<[^>]*>/g, " ").replace(INVISIBLE, " ").replace(/\s+/g, " ").trim();
  if (s.length > max) s = `${s.slice(0, max - 1).trimEnd()}…`;
  return s;
}

// --- URLs --------------------------------------------------------------------

function ipv4Private(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224
  );
}

function ipv6Private(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4Private(mapped[1]);
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v);
}

// Hosts that are this machine or the local network. Name-based check only; the
// HTTP client also checks the resolved address.
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan") || h.endsWith(".home.arpa")) return true;
  if (!h.includes(".") && !h.includes(":")) return true; // bare intranet names
  const kind = isIP(h);
  if (kind === 4) return ipv4Private(h);
  if (kind === 6) return ipv6Private(h);
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  return kind === 4 ? ipv4Private(ip) : kind === 6 ? ipv6Private(ip) : true;
}

// A public http(s) URL with no credentials, or null. Relative links resolve
// against base. http is upgraded to https (opened in the user's browser, so a
// site without https fails there visibly rather than silently downgrading).
export function safeUrl(raw: unknown, base?: string): string | null {
  if (typeof raw !== "string") return null;
  const text = plainText(raw, 2048).replace(/\s/g, "");
  if (!text) return null;
  let u: URL;
  try {
    u = base ? new URL(text, base) : new URL(text);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  if (isPrivateHost(u.hostname)) return null;
  u.protocol = "https:";
  if (u.port === "443") u.port = "";
  return u.toString();
}

// A feed URL the user chose: like safeUrl, but http stays http only if asked,
// because some feeds still only serve http. Upgrading is tried first by the client.
export function safeFeedUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password || isPrivateHost(u.hostname)) return null;
  return u.toString();
}
