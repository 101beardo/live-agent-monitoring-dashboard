import { memo, type CSSProperties } from "react";
import { deriveCombinedStatus } from "../lib/reconcile";
import type { AgentState } from "../lib/types";
import { useNow } from "../hooks/useNow";
import { LiveDuration } from "./LiveDuration";
import { StatusPill } from "./StatusPill";

/**
 * Rendered inside react-window's FixedSizeList, so this is a `div` laid out
 * with the same CSS grid template as the header (see .grid-row in
 * globals.css), not a <tr>. react-window virtualizes by absolutely
 * positioning each row via the `style` prop it hands us — a real <table>
 * can't be virtualized that way, since a <tr> only makes sense inside a
 * <table> layout the browser controls. Trading the native table semantics
 * for `role="row"`/`role="gridcell"` is the deliberate cost of scaling past
 * a few thousand rows; not needed at 300, but this is the shape the brief's
 * stated 2,000-agent production target actually needs.
 */
function AgentRowImpl({
  agent,
  onSelect,
  style,
  isSelected,
}: {
  agent: AgentState;
  onSelect: (agentId: string) => void;
  style: CSSProperties;
  isSelected: boolean;
}) {
  // Each row ticks its own "now" independently, rather than reading one
  // shared context. A single shared ticker would re-render all 300 rows in
  // the same animation frame every tick (a visible synchronized jank). 300
  // independently-phased timers spread that same work smoothly instead, at
  // negligible cost. 15s is plenty against an 8-minute stale threshold —
  // this only needs to notice staleness eventually, not to the second.
  const now = useNow(15_000);
  const status = deriveCombinedStatus(agent, now);
  const onCall = status.kind === "on-call";
  const attention = status.kind === "unreachable" || status.kind === "stale";

  return (
    <div
      className={`grid-row cursor-pointer hover:bg-white/3 ${attention ? "bg-status-red/6" : ""} ${
        isSelected ? "border-l-2 border-accent bg-accent/5" : ""
      }`}
      style={style}
      role="row"
      aria-selected={isSelected}
      onClick={() => onSelect(agent.agentId)}
      tabIndex={0}
      aria-label={`Open details for ${agent.name}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect(agent.agentId);
      }}
    >
      <div role="gridcell" title={agent.name}>
        {agent.name}
      </div>
      <div role="gridcell" className="mono">
        {agent.extension}
      </div>
      <div role="gridcell" title={agent.queues.join(", ")}>
        {agent.queues.join(", ")}
      </div>
      <div role="gridcell" title={agent.site}>
        {agent.site}
      </div>
      <div role="gridcell" className="mono">
        {agent.deviceStatus}
      </div>
      <div role="gridcell" className="mono">
        {agent.agentStatus}
      </div>
      <div role="gridcell">
        <StatusPill status={status} />
      </div>
      <div role="gridcell" className="mono">
        {onCall && agent.callStartedAt ? <LiveDuration startedAt={agent.callStartedAt} /> : "—"}
      </div>
    </div>
  );
}

function areEqual(
  prev: { agent: AgentState; onSelect: unknown; style: CSSProperties; isSelected: boolean },
  next: { agent: AgentState; onSelect: unknown; style: CSSProperties; isSelected: boolean }
) {
  // Reference equality on `agent` is enough — the reducer only produces a new
  // AgentState object for the specific agent an event actually touched, so an
  // unrelated row's `agent` reference never changes and this bails out
  // immediately. `style` also has to be checked: react-window gives every
  // visible row a fresh style object each render pass (top offset can shift
  // as the list scrolls), so this is the one prop that's expected to change
  // even when nothing about the agent did. `isSelected` also has to be
  // checked explicitly — it's a plain boolean derived outside this row (does
  // this agentId match the URL's ?agent=), so `agent`'s own reference never
  // changes when selection moves to or from this row. Skipping it here would
  // silently reintroduce the same class of bug as the react-window remount
  // fix: a memo comparator blind to a prop that actually changed.
  return (
    prev.agent === next.agent &&
    prev.onSelect === next.onSelect &&
    prev.style === next.style &&
    prev.isSelected === next.isSelected
  );
}

export const AgentRow = memo(AgentRowImpl, areEqual);
