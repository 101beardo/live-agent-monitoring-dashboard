import { FixedSizeList, type ListChildComponentProps } from "react-window";
import type { AgentState } from "../lib/types";
import type { SortDir, SortKey } from "../hooks/useFilters";
import { AgentRow } from "./AgentRow";

const ROW_HEIGHT = 40;
const LIST_HEIGHT = 560;

export function AgentGrid({
  agents,
  onSelect,
  sort,
  dir,
  onSort,
}: {
  agents: AgentState[];
  onSelect: (agentId: string) => void;
  sort: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  if (agents.length === 0) {
    return <div className="empty-state">No agents match the current filters.</div>;
  }

  const arrow = (key: SortKey) => (sort === key ? (dir === "asc" ? " ▲" : " ▼") : "");

  const Row = ({ index, style }: ListChildComponentProps) => {
    const agent = agents[index];
    if (!agent) return null;
    return <AgentRow agent={agent} onSelect={onSelect} style={style} />;
  };

  return (
    <div className="agent-grid" role="table" aria-label="Agent roster" aria-rowcount={agents.length}>
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
      <FixedSizeList height={LIST_HEIGHT} width="100%" itemCount={agents.length} itemSize={ROW_HEIGHT} overscanCount={8}>
        {Row}
      </FixedSizeList>
    </div>
  );
}
