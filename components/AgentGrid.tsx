import type { AgentState } from "../lib/types";
import type { SortDir, SortKey } from "../hooks/useFilters";
import { AgentRow } from "./AgentRow";

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

  return (
    <table className="agent-grid">
      <thead>
        <tr>
          <th className="sortable" onClick={() => onSort("name")}>
            Agent{arrow("name")}
          </th>
          <th>Ext</th>
          <th className="sortable" onClick={() => onSort("queue")}>
            Queue(s){arrow("queue")}
          </th>
          <th className="sortable" onClick={() => onSort("site")}>
            Site{arrow("site")}
          </th>
          <th>Device</th>
          <th>Agent</th>
          <th className="sortable" onClick={() => onSort("status")}>
            Status{arrow("status")}
          </th>
          <th className="sortable" onClick={() => onSort("duration")}>
            Duration{arrow("duration")}
          </th>
        </tr>
      </thead>
      <tbody>
        {agents.map((agent) => (
          <AgentRow key={agent.agentId} agent={agent} onSelect={onSelect} />
        ))}
      </tbody>
    </table>
  );
}
