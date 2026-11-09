// Decides when to fetch: at each edition time, on catch-up after sleep or a
// closed app, and on launch/wake if the last fetch is old. Never fetches more
// than one catch-up edition. Retries failed (offline) editions with back-off and
// never shows an error. Clock and timers are injected so tests can fake time.

import { currentEdition, type EditionTimes, nextEditionAt } from "./schedule.ts";

export const CHECK_EVERY_MS = 15 * 60_000; // re-check at least this often (time zone changes)
export const STALE_MS = 6 * 3600_000; // fetch on launch/wake if the last fetch is older
export const RETRY_MS = [5, 15, 30, 60].map((m) => m * 60_000);

export type Trigger = "start" | "timer" | "wake" | "settings";
export type RunReason = "due" | "stale";

export type SchedulerDeps = {
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  times: () => EditionTimes;
  newestEditionFor: () => number | null; // scheduledFor of the newest stored edition
  lastFetchAt: () => number | null;
  run: (reason: RunReason) => Promise<"ok" | "failed">;
  log?: (msg: string) => void;
};

export class Scheduler {
  private d: SchedulerDeps;
  private timer: unknown = null;
  private running = false;
  private failures = 0;
  private retryAt: number | null = null;
  private stopped = false;

  constructor(deps: SchedulerDeps) {
    this.d = deps;
  }

  start(): Promise<void> {
    this.stopped = false;
    return this.check("start");
  }

  stop(): void {
    this.stopped = true;
    this.clear();
  }

  // When the next check will happen (for tests and logs).
  nextCheckIn: number | null = null;

  async check(trigger: Trigger): Promise<void> {
    if (this.running || this.stopped) return;
    this.clear();
    const now = this.d.now();
    const times = this.d.times();
    const current = currentEdition(now, times);
    const newest = this.d.newestEditionFor();
    const due = newest === null || newest < current.scheduledFor;
    const last = this.d.lastFetchAt();
    const stale = !due && (trigger === "start" || trigger === "wake") && (last === null || now - last >= STALE_MS);
    // A wake or launch retries a failed edition at once (the network may be back).
    const mayRetry = this.retryAt === null || now >= this.retryAt || trigger === "wake" || trigger === "start";

    if ((due && mayRetry) || stale) {
      const reason: RunReason = due ? "due" : "stale";
      this.running = true;
      let result: "ok" | "failed" = "failed";
      try {
        this.d.log?.(`[scheduler] ${trigger}: fetching (${reason}, ${current.slot} edition)`);
        result = await this.d.run(reason);
      } catch (e) {
        this.d.log?.(`[scheduler] run threw: ${String(e)}`);
      } finally {
        this.running = false;
      }
      if (result === "ok" || reason === "stale") {
        this.failures = 0;
        this.retryAt = null;
      } else {
        this.retryAt = this.d.now() + RETRY_MS[Math.min(this.failures, RETRY_MS.length - 1)];
        this.failures++;
        this.d.log?.(`[scheduler] edition failed (offline?); retry at ${new Date(this.retryAt).toLocaleTimeString()}`);
      }
    }
    this.schedule();
  }

  private schedule(): void {
    if (this.stopped) return;
    const now = this.d.now();
    const targets = [nextEditionAt(now, this.d.times()), now + CHECK_EVERY_MS];
    if (this.retryAt !== null) targets.push(this.retryAt);
    const wait = Math.max(1000, Math.min(...targets) - now);
    this.nextCheckIn = wait;
    this.timer = this.d.setTimer(() => void this.check("timer"), wait);
  }

  private clear(): void {
    if (this.timer !== null) this.d.clearTimer(this.timer);
    this.timer = null;
    this.nextCheckIn = null;
  }
}
