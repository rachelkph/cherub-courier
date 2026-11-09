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
