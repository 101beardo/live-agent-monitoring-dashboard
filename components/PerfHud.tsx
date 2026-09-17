"use client";

import { Profiler, type ProfilerOnRenderCallback, type ReactNode, useRef, useState } from "react";

interface Stats {
  commits: number;
  totalActualMs: number;
  windowStart: number;
}

/**
 * A real measurement, not an assertion. Wraps its children in React's
 * <Profiler> and reports commit count + average commit duration over a
 * rolling ~3s window. Only mounted behind `?perf=1` (see Dashboard.tsx) —
 * this is a debugging/demo aid, not something a supervisor should ever see.
 *
 * Used to produce the numbers in the README's performance section by
 * comparing `?dispatch=batched` against `?dispatch=naive` on the same
 * machine, same dataset, same eventsPerSecond.
 */
export function PerfHud({ id, children }: { id: string; children: ReactNode }) {
  const [display, setDisplay] = useState<{ commitsPerSec: number; avgMs: number }>({
    commitsPerSec: 0,
    avgMs: 0,
  });
  const statsRef = useRef<Stats>({ commits: 0, totalActualMs: 0, windowStart: performance.now() });

  const onRender: ProfilerOnRenderCallback = (_id, _phase, actualDuration) => {
    const s = statsRef.current;
    s.commits += 1;
    s.totalActualMs += actualDuration;

    const elapsed = performance.now() - s.windowStart;
    if (elapsed >= 1000) {
      setDisplay({
        commitsPerSec: Math.round((s.commits / elapsed) * 1000),
        avgMs: s.commits > 0 ? s.totalActualMs / s.commits : 0,
      });
      statsRef.current = { commits: 0, totalActualMs: 0, windowStart: performance.now() };
    }
  };

  return (
    <>
      <div className="perf-hud mono">
        commits/s <b>{display.commitsPerSec}</b> · avg commit <b>{display.avgMs.toFixed(2)}ms</b>
      </div>
      <Profiler id={id} onRender={onRender}>
        {children}
      </Profiler>
    </>
  );
}
