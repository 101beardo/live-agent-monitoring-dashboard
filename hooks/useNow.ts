"use client";

import { useEffect, useState } from "react";

/**
 * Returns the current time in ms, refreshed on its own interval.
 *
 * Deliberately NOT a shared context. This hook is used in two very different
 * places with very different cadences:
 *   - AgentRow calls it at ~5s to recheck staleness / combined status — cheap
 *     even across 300 rows, since nothing here does real work.
 *   - LiveDuration calls it at 1s, but only within itself, isolated to a
 *     single small text node, never the row or the grid.
 * A single shared "now" context ticking at 1s would force every subscriber
 * to re-render every second regardless of whether it needed to — the whole
 * point of the two cadences is that most of the UI does NOT need 1s updates.
 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
