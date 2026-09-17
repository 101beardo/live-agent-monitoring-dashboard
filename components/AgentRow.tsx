import { memo } from "react";
import { deriveCombinedStatus } from "../lib/reconcile";
import type { AgentState } from "../lib/types";
import { useNow } from "../hooks/useNow";
import { LiveDuration } from "./LiveDuration";
import { StatusPill } from "./StatusPill";

function AgentRowImpl({ agent, onSelect }: { agent: AgentState; onSelect: (agentId: string) => void }) {
  // Each row ticks its own "now" independently, rather than reading one
  // shared context. A single shared ticker would re-render all 300 rows in
  // the same animation frame every tick (a visible synchronized jank). 300
  // independently-phased timers spread that same work smoothly instead, at
  // negligible cost. 15s is plenty against an 8-minute stale threshold —
  // this only needs to notice staleness eventually, not to the second.
  const now = useNow(15_000);
  const status = deriveCombinedStatus(agent, now);
  const onCall = status.kind === "on-call";

  return (
    <tr
      className={status.kind === "unreachable" || status.kind === "stale" ? "row-attention" : undefined}
      onClick={() => onSelect(agent.agentId)}
      tabIndex={0}
      role="button"
      aria-label={`Open details for ${agent.name}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect(agent.agentId);
      }}
    >
      <td>{agent.name}</td>
      <td className="mono">{agent.extension}</td>
      <td>{agent.queues.join(", ")}</td>
      <td>{agent.site}</td>
      <td className="mono">{agent.deviceStatus}</td>
      <td className="mono">{agent.agentStatus}</td>
      <td>
        <StatusPill status={status} />
      </td>
      <td className="mono">{onCall && agent.callStartedAt ? <LiveDuration startedAt={agent.callStartedAt} /> : "—"}</td>
    </tr>
  );
}

function areEqual(prev: { agent: AgentState; onSelect: unknown }, next: { agent: AgentState; onSelect: unknown }) {
  // Reference equality is enough — the reducer only produces a new AgentState
  // object for the specific agent an event actually touched, so an unrelated
  // row's `agent` reference never changes and this bails out immediately.
  return prev.agent === next.agent && prev.onSelect === next.onSelect;
}

export const AgentRow = memo(AgentRowImpl, areEqual);
