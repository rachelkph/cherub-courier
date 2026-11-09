// Loads the curated source list: the bundled copy, or a newer validated copy
// downloaded from the project's GitHub (at most once a day). Any problem with the
// remote copy falls back to the cached or bundled copy, never to an empty list.

import { readFile } from "node:fs/promises";
import { type Deps, fetchText } from "../feeds/client.ts";
import { parseSourcesFile, type SourcesFile } from "./schema.ts";

export const REMOTE_CHECK_MS = 24 * 3600_000;
export const MAX_SOURCES_BYTES = 1024 * 1024;

export type RemoteCache = {
  checkedAt: number;
  etag?: string;
  lastModified?: string;
  file?: unknown; // last valid remote copy (re-validated on every load)
  lastError?: string;
};

export type LoadResult = {
  file: SourcesFile;
  origin: "bundled" | "remote";
  remote: RemoteCache;
  note?: string; // why a remote copy was not used
};

// The cache file on disk is untrusted too; keep only well-typed fields.
export function cleanRemoteCache(raw: unknown): RemoteCache | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  return {
    checkedAt: typeof r.checkedAt === "number" && Number.isFinite(r.checkedAt) ? r.checkedAt : 0,
    etag: str(r.etag),
    lastModified: str(r.lastModified),
    file: r.file,
    lastError: str(r.lastError),
  };
}

function validOrNull(raw: unknown): SourcesFile | null {
  try {
    return parseSourcesFile(raw);
  } catch {
    return null;
  }
}

// Newer lastReviewed wins; ties keep the bundled copy (it ships with the code that reads it).
function pick(bundled: SourcesFile, remote: SourcesFile | null): { file: SourcesFile; origin: "bundled" | "remote" } {
  return remote && remote.lastReviewed > bundled.lastReviewed ? { file: remote, origin: "remote" } : { file: bundled, origin: "bundled" };
}

export async function loadSources(opts: {
  bundledPath: string;
  remoteUrl: string;
  remote: RemoteCache | undefined;
  deps: Deps;
  allowNetwork: boolean;
}): Promise<LoadResult> {
  // The bundled copy is part of the app; if it is broken that is a build error.
  const bundled = parseSourcesFile(JSON.parse(await readFile(opts.bundledPath, "utf8")));
  const now = opts.deps.now();
  let remote: RemoteCache = opts.remote ?? { checkedAt: 0 };
  let note: string | undefined;

  if (opts.allowNetwork && opts.remoteUrl && now - remote.checkedAt >= REMOTE_CHECK_MS) {
    try {
      const res = await fetchText(opts.remoteUrl, opts.deps, {
        maxBytes: MAX_SOURCES_BYTES,
        accept: "application/json, text/plain;q=0.5",
        etag: remote.etag,
        lastModified: remote.lastModified,
      });
      if (res.status === 304) {
        remote = { ...remote, checkedAt: now, lastError: undefined };
      } else {
        let parsed: unknown;
        try {
          parsed = JSON.parse(res.body);
        } catch {
          throw new Error("remote sources file is not JSON");
        }
        parseSourcesFile(parsed); // throws with the reason if invalid
        remote = { checkedAt: now, etag: res.etag, lastModified: res.lastModified, file: parsed };
      }
    } catch (e) {
      note = `remote sources not used: ${(e as Error).message}`;
      // Keep the last good copy; try again tomorrow.
      remote = { ...remote, checkedAt: now, lastError: (e as Error).message };
    }
  }

  const cached = remote.file === undefined ? null : validOrNull(remote.file);
  if (remote.file !== undefined && !cached) note = note ?? "cached remote sources failed validation";
  return { ...pick(bundled, cached), remote, note };
}
