// Pure timing helpers. All times are milliseconds; positions are art pixels.

import type { SequenceStep } from "./manifest.ts";

export type Rng = () => number; // [0, 1)

export function loopIndex(count: number, frameMs: number, elapsedMs: number): number {
  return Math.floor(Math.max(0, elapsedMs) / frameMs) % count;
}

export function sequenceDuration(steps: SequenceStep[]): number {
  return steps.reduce((sum, s) => sum + s.ms, 0);
}

// The step showing at elapsedMs, or null once the sequence is over.
export function sequenceStep<S extends SequenceStep>(steps: S[], elapsedMs: number): S | null {
  let t = Math.max(0, elapsedMs);
  for (const s of steps) {
    if (t < s.ms) return s;
    t -= s.ms;
  }
  return null;
}

export function nextAt(now: number, [min, max]: [number, number], rng: Rng): number {
  return now + min + Math.floor(rng() * (max - min + 1));
}

// Pile layers left after each paper roll: up to maxRolls rolls, layers removed
// as evenly as possible, ending at 0. e.g. (5, 3) -> [3, 2, 0].
export function tossPlan(layers: number, maxRolls: number): number[] {
  if (layers <= 0) return [];
  const rolls = Math.min(layers, maxRolls);
  return Array.from({ length: rolls }, (_, i) => Math.round(layers * (1 - (i + 1) / rolls)));
}

// Parabolic hop: t in [0, 1] -> offset from the start, y up is negative.
export function arc(t: number, distance: number, height: number): { dx: number; dy: number } {
  const c = Math.min(1, Math.max(0, t));
  // `|| 0` turns -0 into 0 so positions compare cleanly.
  return { dx: Math.round(distance * c) || 0, dy: Math.round(-4 * height * c * (1 - c)) || 0 };
}
