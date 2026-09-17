import { useMemo } from "react";
import { deriveCombinedStatus } from "../lib/reconcile";
import type { AgentState, CombinedStatus } from "../lib/types";

const ORDER: CombinedStatus["kind"][] = [
  "on-call",
  "available",
  "wrapping-up",
  "on-break",
  "unreachable",
  "stale",
  "logged-out",
];

export function SummaryBar({ agents, now }: { agents: AgentState[]; now: number }) {
  const { counts, longestCallSeconds } = useMemo(() => {
    const c: Record<string, number> = {};
    let longest = 0;
    for (const a of agents) {
      const status = deriveCombinedStatus(a, now);
      c[status.kind] = (c[status.kind] ?? 0) + 1;
      if (status.kind === "on-call" && a.callStartedAt) {
        const secs = (now - new Date(a.callStartedAt).getTime()) / 1000;
        if (secs > longest) longest = secs;
      }
    }
    return { counts: c, longestCallSeconds: longest };
  }, [agents, now]);

  return (
    <div className="summary-bar">
      {ORDER.filter((k) => counts[k]).map((k) => (
        <span key={k} className="summary-item">
          <b>{counts[k]}</b> {k.replace("-", " ")}
        </span>
      ))}
      {longestCallSeconds > 0 && (
        <span className="summary-item">
          longest call <b>{Math.floor(longestCallSeconds / 60)}m</b>
        </span>
      )}
    </div>
  );
}
