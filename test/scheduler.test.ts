import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { currentEdition, nextEditionAt, snoozeEnd } from "../src/main/schedule.ts";
import { CHECK_EVERY_MS, RETRY_MS, Scheduler, type Trigger } from "../src/main/scheduler.ts";

const ORIGINAL_TZ = process.env.TZ;
process.env.TZ = "America/Los_Angeles";
after(() => {
  process.env.TZ = ORIGINAL_TZ;
});

const MIN = 60_000;
const H = 60 * MIN;
const local = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const hhmm = (t: number) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const TIMES = { morning: "08:00", evening: "18:00" };

// A fake clock with timers, driving a real Scheduler.
function harness(start: number, init: { newest: number | null; lastFetch: number | null }) {
  let now = start;
  let newest = init.newest;
  let lastFetch = init.lastFetch;
  let failing = false;
  const timers = new Set<{ at: number; fn: () => void }>();
  const runs: { reason: string; at: number }[] = [];
  const s = new Scheduler({
    now: () => now,
    setTimer: (fn, ms) => {
      const t = { at: now + ms, fn };
      timers.add(t);
      return t;
    },
    clearTimer: (t) => timers.delete(t as { at: number; fn: () => void }),
    times: () => TIMES,
    newestEditionFor: () => newest,
    lastFetchAt: () => lastFetch,
    run: async (reason) => {
      runs.push({ reason, at: now });
      if (failing) return "failed";
      newest = Math.max(newest ?? 0, currentEdition(now, TIMES).scheduledFor);
      lastFetch = now;
      return "ok";
    },
  });
  const flush = async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
  };
  return {
    s,
    runs,
    setFailing: (f: boolean) => {
      failing = f;
    },
    now: () => now,
    // Fire timers in order until `until`.
    async advanceTo(until: number) {
      for (;;) {
        const next = [...timers].filter((t) => t.at <= until).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        timers.delete(next);
        now = next.at;
        next.fn();
        await flush();
      }
      now = until;
    },
    async trigger(t: Trigger) {
      await s.check(t);
      await flush();
    },
    pendingTimers: () => [...timers].map((t) => t.at),
  };
}

describe("schedule helpers", () => {
  it("finds the next edition time", () => {
    assert.equal(nextEditionAt(local(2026, 11, 9, 7, 59), TIMES), local(2026, 11, 9, 8));
    assert.equal(nextEditionAt(local(2026, 11, 9, 8), TIMES), local(2026, 11, 9, 18));
    assert.equal(nextEditionAt(local(2026, 11, 9, 23), TIMES), local(2026, 11, 10, 8));
  });

  it("snooze ends after an hour, or at the next morning edition", () => {
    assert.equal(snoozeEnd("hour", local(2026, 11, 9, 14), TIMES), local(2026, 11, 9, 15));
    assert.equal(snoozeEnd("tomorrow", local(2026, 11, 9, 6), TIMES), local(2026, 11, 9, 8), "before 8 AM: this morning");
    assert.equal(snoozeEnd("tomorrow", local(2026, 11, 9, 14), TIMES), local(2026, 11, 10, 8));
  });
});

describe("Scheduler", () => {
  it("fires an edition on time, and only then", async () => {
    // Last night's edition is in; a refresh ran at 6 AM, so launch at 7 AM is not stale.
    const h = harness(local(2026, 11, 9, 7), { newest: local(2026, 11, 8, 18), lastFetch: local(2026, 11, 9, 6) });
    await h.trigger("start");
    assert.equal(h.runs.length, 0);
    assert.ok(Math.min(...h.pendingTimers()) - h.now() <= CHECK_EVERY_MS, "re-checks at least every 15 min");
    await h.advanceTo(local(2026, 11, 9, 17, 59));
    assert.deepEqual(h.runs.map((r) => [r.reason, hhmm(r.at)]), [["due", "08:00"]]);
    await h.advanceTo(local(2026, 11, 9, 23));
    assert.deepEqual(h.runs.map((r) => [r.reason, hhmm(r.at)]), [["due", "08:00"], ["due", "18:00"]]);
  });

  it("catches up a missed edition on wake, once", async () => {
    const h = harness(local(2026, 11, 9, 10, 30), { newest: local(2026, 11, 8, 18), lastFetch: local(2026, 11, 8, 18, 1) });
    await h.trigger("wake");
    assert.deepEqual(h.runs.map((r) => r.reason), ["due"]);
    await h.trigger("wake");
    assert.equal(h.runs.length, 1, "not again on the next wake");
  });

  it("after sleeping through two editions, delivers only the latest", async () => {
    const h = harness(local(2026, 11, 9, 10, 30), { newest: local(2026, 11, 8, 8), lastFetch: local(2026, 11, 8, 8, 1) });
    await h.trigger("wake");
    await h.advanceTo(local(2026, 11, 9, 17));
    assert.equal(h.runs.length, 1);
  });

  it("fetches on launch or wake when the last fetch is over 6 hours old", async () => {
    const stale = harness(local(2026, 11, 9, 15), { newest: local(2026, 11, 9, 8), lastFetch: local(2026, 11, 9, 8, 30) });
    await stale.trigger("start");
    assert.deepEqual(stale.runs.map((r) => r.reason), ["stale"]);
    const fresh = harness(local(2026, 11, 9, 13), { newest: local(2026, 11, 9, 8), lastFetch: local(2026, 11, 9, 8, 30) });
    await fresh.trigger("start");
    await fresh.advanceTo(local(2026, 11, 9, 17, 59));
    assert.equal(fresh.runs.length, 0, "periodic checks never count as stale; only launch and wake");
  });

  it("retries a failed (offline) edition with back-off, and right away on wake", async () => {
    const h = harness(local(2026, 11, 9, 7, 59), { newest: local(2026, 11, 8, 18), lastFetch: local(2026, 11, 9, 7) });
    h.setFailing(true);
    await h.trigger("start");
    await h.advanceTo(local(2026, 11, 9, 8, 51));
    assert.deepEqual(h.runs.map((r) => hhmm(r.at)), ["08:00", "08:05", "08:20", "08:50"]);
    assert.deepEqual(RETRY_MS.slice(0, 3).map((ms) => ms / MIN), [5, 15, 30]);
    h.setFailing(false);
    await h.advanceTo(local(2026, 11, 9, 9, 10));
    await h.trigger("wake");
    assert.deepEqual(h.runs.map((r) => hhmm(r.at)).slice(-1), ["09:10"], "wake retried immediately and succeeded");
    await h.advanceTo(local(2026, 11, 9, 17, 59));
    assert.equal(h.runs.length, 5, "no more retries after success");
  });

  it("keeps local edition times across daylight-saving changes", async () => {
    // US clocks spring forward on 8 Mar 2026 and fall back on 1 Nov 2026.
    for (const [y, mo, d] of [[2026, 3, 7], [2026, 10, 31]]) {
      const h = harness(local(y, mo, d, 19), { newest: local(y, mo, d, 18), lastFetch: local(y, mo, d, 18) });
      await h.trigger("start");
      await h.advanceTo(local(y, mo, d + 1, 23));
      assert.deepEqual(h.runs.map((r) => hhmm(r.at)), ["08:00", "18:00"], `${y}-${mo}-${d + 1}`);
    }
  });

  it("follows a time zone change within one check interval", async () => {
    // 00:30 in Los Angeles on 10 Nov; last night's 18:00 edition is in. Fly to Tokyo, where it is
    // 17:30 — the Tokyo evening edition is 30 minutes away, long before the next LA edition.
    const h = harness(local(2026, 11, 10, 0, 30), { newest: local(2026, 11, 9, 18), lastFetch: local(2026, 11, 10, 0) });
    await h.trigger("start");
    process.env.TZ = "Asia/Tokyo";
    try {
      await h.advanceTo(h.now() + 3 * H);
      const first = h.runs[0];
      assert.ok(first, "an edition ran");
      const d = new Date(first.at);
      assert.equal(d.getHours(), 18, "the Tokyo evening edition");
      assert.ok(d.getMinutes() < 15, `within 15 minutes of the new local time (ran ${hhmm(first.at)})`);
    } finally {
      process.env.TZ = "America/Los_Angeles";
    }
  });
});
