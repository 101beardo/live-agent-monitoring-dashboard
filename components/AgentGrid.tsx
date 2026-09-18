import { memo } from "react";
import { FixedSizeList, type ListChildComponentProps } from "react-window";
import type { AgentState, SortDir, SortKey } from "../lib/types";
import { AgentRow } from "./AgentRow";
import { EmptyState } from "./EmptyState";

const ROW_HEIGHT = 40;
const LIST_HEIGHT = 560;

interface RowData {
  agents: AgentState[];
  onSelect: (agentId: string) => void;
  selectedAgentId: string | null;
}

/**
 * Defined at module scope, not inside AgentGrid, and this is load-bearing,
 * not style preference. react-window renders each row via
 * `createElement(children, itemProps)` — it uses the `children` render prop
 * as the element's TYPE, not just calling it as a function. A component
 * defined inside another component's body is a NEW type on every render, and
 * a type change forces React to unmount and remount, never just re-render —
 * which bypasses AgentRow's React.memo entirely, since memo only helps when
 * reconciling an EXISTING instance against new props, not a fresh mount.
 *
 * Confirmed empirically: with the Row closure defined inline (the original
 * version), every visible + overscanned row was destroying and recreating
 * itself on nearly every event batch — 1,343 mount/unmount cycles logged in
 * 4 seconds for the same ~22 row instances. AgentRow's memo comparator never
 * got a chance to run for almost any of that. Moving Row here and passing
 * `agents`/`onSelect` through react-window's `itemData` (a normal prop, safe
 * to change every render) instead of closure capture keeps Row's identity
 * stable, so updates reconcile in place and the memo bail-out actually fires.
 */
const Row = memo(function Row({ index, style, data }: ListChildComponentProps<RowData>) {
  const agent = data.agents[index];
  if (!agent) return null;
  return (
    <AgentRow
      agent={agent}
      onSelect={data.onSelect}
      style={style}
      isSelected={agent.agentId === data.selectedAgentId}
    />
  );
});

export function AgentGrid({
  agents,
  onSelect,
  sort,
  dir,
  onSort,
  selectedAgentId,
}: {
  agents: AgentState[];
  onSelect: (agentId: string) => void;
  sort: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  selectedAgentId: string | null;
}) {
  if (agents.length === 0) {
    return <EmptyState message="No agents match the current filters." />;
  }

  const arrow = (key: SortKey) => (sort === key ? (dir === "asc" ? " ▲" : " ▼") : "");

  return (
    <div
      className="bg-panel rounded-lg overflow-hidden"
      role="table"
      aria-label="Agent roster"
      aria-rowcount={agents.length}
    >
      <div className="grid-row grid-head" role="row">
        <div role="columnheader" className="sortable" onClick={() => onSort("name")}>
          Agent{arrow("name")}
        </div>
        <div role="columnheader">Ext</div>
        <div role="columnheader" className="sortable" onClick={() => onSort("queue")}>
          Queue(s){arrow("queue")}
        </div>
        <div role="columnheader" className="sortable" onClick={() => onSort("site")}>
          Site{arrow("site")}
        </div>
        <div role="columnheader">Device</div>
        <div role="columnheader">Agent</div>
        <div role="columnheader" className="sortable" onClick={() => onSort("status")}>
          Status{arrow("status")}
        </div>
        <div role="columnheader" className="sortable" onClick={() => onSort("duration")}>
          Duration{arrow("duration")}
        </div>
      </div>

      {/* Only the ~14 rows that fit LIST_HEIGHT are ever mounted, regardless
          of whether `agents` has 300 entries or the production-scale 2,000+
          the brief describes. Scrolling swaps which AgentRow instances are
          mounted; it does not grow the DOM. */}
      <FixedSizeList
        height={LIST_HEIGHT}
        width="100%"
        itemCount={agents.length}
        itemSize={ROW_HEIGHT}
        overscanCount={8}
        itemData={{ agents, onSelect, selectedAgentId }}
      >
        {Row}
      </FixedSizeList>
    </div>
  );
}
