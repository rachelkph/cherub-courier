// Local state in one JSON file in the app's user-data folder. Written atomically
// (temp file + rename), readable only by the user. Treated as untrusted on load:
// every stored headline and link is re-sanitized, and a corrupt file is set aside
// rather than crashing the app.

import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { FeedCache } from "./client.ts";
import type { ParsedEntry } from "./parse.ts";
import { plainText, safeUrl } from "./sanitize.ts";
import type { Candidate } from "./select.ts";

export const SCHEMA_VERSION = 1;

export type Edition = {
  id: string; // e.g. "2026-11-08-evening"
  slot: "morning" | "evening";
  scheduledFor: number; // the edition time it belongs to
  fetchedAt: number;
  items: Candidate[];
};

export type State = {
  schemaVersion: typeof SCHEMA_VERSION;
  feeds: Record<string, FeedCache>;
  editions: Edition[];
  delivered: { key: string; at: number }[]; // urlKeys of everything ever put in an edition (pruned)
};

export function emptyState(): State {
  return { schemaVersion: SCHEMA_VERSION, feeds: {}, editions: [], delivered: [] };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

function cleanEntry(v: unknown): ParsedEntry | null {
  if (!isObj(v)) return null;
  const headline = plainText(v.headline);
  const link = safeUrl(v.link);
  const publishedAt = num(v.publishedAt, Number.NaN);
  return headline && link && Number.isFinite(publishedAt) ? { headline, link, publishedAt } : null;
}

function cleanItem(v: unknown): Candidate | null {
  const e = cleanEntry(v);
  if (!e || !isObj(v)) return null;
  const source = plainText(v.source, 80);
  const sourceId = str(v.sourceId);
  const topic = str(v.topic);
  if (!source || !sourceId || !topic) return null;
  return { ...e, source, sourceId, topic, paywall: v.paywall === true };
}

function cleanFeed(v: unknown): FeedCache | null {
  if (!isObj(v) || typeof v.url !== "string") return null;
  const status = v.status === "ok" || v.status === "error" || v.status === "gone" ? v.status : "new";
  return {
    url: v.url,
    fetchUrl: str(v.fetchUrl),
    etag: str(v.etag),
    lastModified: str(v.lastModified),
    title: str(v.title) ? plainText(v.title, 120) : undefined,
    entries: Array.isArray(v.entries) ? v.entries.map(cleanEntry).filter((e): e is ParsedEntry => e !== null) : [],
    status,
    lastError: str(v.lastError),
    lastSuccessAt: typeof v.lastSuccessAt === "number" ? v.lastSuccessAt : undefined,
    failures: num(v.failures),
    nextAllowedAt: num(v.nextAllowedAt),
  };
}

export function cleanState(raw: unknown): State {
  if (!isObj(raw) || raw.schemaVersion !== SCHEMA_VERSION) throw new Error("unknown state format");
  const feeds: Record<string, FeedCache> = {};
  if (isObj(raw.feeds)) {
    for (const [id, f] of Object.entries(raw.feeds)) {
      const c = cleanFeed(f);
      if (c) feeds[id] = c;
    }
  }
  const editions = (Array.isArray(raw.editions) ? raw.editions : []).flatMap((e): Edition[] => {
    if (!isObj(e) || typeof e.id !== "string" || (e.slot !== "morning" && e.slot !== "evening")) return [];
    const items = Array.isArray(e.items) ? e.items.map(cleanItem).filter((i): i is Candidate => i !== null) : [];
    return [{ id: e.id, slot: e.slot, scheduledFor: num(e.scheduledFor), fetchedAt: num(e.fetchedAt), items }];
  });
  const delivered = (Array.isArray(raw.delivered) ? raw.delivered : []).flatMap((d) =>
    isObj(d) && typeof d.key === "string" ? [{ key: d.key, at: num(d.at) }] : [],
  );
  return { schemaVersion: SCHEMA_VERSION, feeds, editions, delivered };
}

export async function loadState(path: string, now = Date.now()): Promise<State> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
    throw e;
  }
  try {
    return cleanState(JSON.parse(text));
  } catch {
    await rename(path, `${path}.corrupt-${now}`).catch(() => undefined);
    return emptyState();
  }
}

export async function saveState(path: string, state: State): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp-${process.pid}`;
  await writeFile(tmp, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, path);
}
