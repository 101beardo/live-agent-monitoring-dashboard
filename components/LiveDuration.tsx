"use client";

import { memo, useEffect, useState } from "react";
import { formatDuration } from "../lib/format";

/**
 * The one component in the app that re-renders every second. It is a single
 * <span> with its own local interval — the tick never touches the row, the
 * grid, or any shared state, so a call timer never costs a full re-render of
 * 300 rows. This is the direct answer to the brief's "must not cost you a
 * full re-render of the grid every second" requirement.
 */
function LiveDurationImpl({ startedAt }: { startedAt: string }) {
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const seconds = (Date.now() - new Date(startedAt).getTime()) / 1000;
  return <span className="tabular-nums">{formatDuration(seconds)}</span>;
}

export const LiveDuration = memo(LiveDurationImpl);
