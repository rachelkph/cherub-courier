// Edition times. The most recent scheduled edition at or before `now`, in local
// time: before the morning time, that is yesterday's evening edition.

export type Slot = "morning" | "evening";
export type EditionTimes = { morning: string; evening: string }; // "HH:MM"

function at(day: Date, hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0).getTime();
}

export function currentEdition(now: number, times: EditionTimes): { slot: Slot; scheduledFor: number } {
  const today = new Date(now);
  const morning = at(today, times.morning);
  const evening = at(today, times.evening);
  if (now >= evening) return { slot: "evening", scheduledFor: evening };
  if (now >= morning) return { slot: "morning", scheduledFor: morning };
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  return { slot: "evening", scheduledFor: at(yesterday, times.evening) };
}

// The next scheduled edition strictly after `now`.
export function nextEditionAt(now: number, times: EditionTimes): number {
  const today = new Date(now);
  for (const day of [0, 1]) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + day);
    for (const t of [at(d, times.morning), at(d, times.evening)].sort((a, b) => a - b)) if (t > now) return t;
  }
  return at(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2), times.morning);
}

// Snooze: an hour, or until the next morning edition (tomorrow's if today's has passed).
export function snoozeEnd(kind: "hour" | "tomorrow", now: number, times: EditionTimes): number {
  if (kind === "hour") return now + 3600_000;
  const today = new Date(now);
  const morningToday = at(today, times.morning);
  return morningToday > now ? morningToday : at(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1), times.morning);
}
