"use client";

import { useEffect, useState } from "react";

/**
 * Returns the current time in ms, refreshed on its own interval.
 *
 * Deliberately NOT a shared context. Two call sites, two different cadences:
 *   - Dashboard.tsx calls it at 5s, to drive sort-by-duration and the summary
 *     bar — those don't need to feel like they're ticking every second.
 *   - AgentRow calls it at 15s, per row, to recheck staleness / combined
 *     status independently — cheap even across 300 rows, since nothing here
 *     does real work, and 15s is plenty against an 8-minute stale threshold.
 * A single shared "now" context ticking at 1s would force every subscriber
 * to re-render every second regardless of whether it needed to. LiveDuration
 * (the one place that genuinely needs 1s precision) deliberately does NOT
 * use this hook at all — it keeps its own local tick, isolated to a single
 * text node, so its 1s cadence never touches this hook's subscribers.
 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
