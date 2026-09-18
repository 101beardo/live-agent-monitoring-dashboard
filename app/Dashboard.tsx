"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useAgentStream } from "../hooks/useAgentStream";
import { useFilters } from "../hooks/useFilters";
import { useNow } from "../hooks/useNow";
import { useSelectedAgent } from "../hooks/useSelectedAgent";
import { distinctQueuesAndSites, nextSort, selectVisibleAgents } from "../lib/selectors";
import type { SortKey } from "../lib/types";
import { ConnectionBanner } from "../components/ConnectionBanner";
import { FilterBar } from "../components/FilterBar";
import { SummaryBar } from "../components/SummaryBar";
import { AgentGrid } from "../components/AgentGrid";
import { AgentDetailPanel } from "../components/AgentDetailPanel";
import { PerfHud } from "../components/PerfHud";
import { LoadingState } from "../components/LoadingState";
import { ErrorState } from "../components/ErrorState";

export function Dashboard() {
  const searchParams = useSearchParams();
  // Debugging/demo-only params, never surfaced in the UI: ?dispatch=naive
  // reverts to per-event dispatch, ?perf=1 shows the live render-cost HUD.
  // Together they're how the README's performance numbers were produced.
  const dispatchMode = searchParams.get("dispatch") === "naive" ? "naive" : "batched";
  const showPerfHud = searchParams.get("perf") === "1";
  const rateParam = searchParams.get("rate");
  const eventsPerSecond = rateParam ? Number(rateParam) : undefined;

  const { agents, connectionStatus, rosterState, retryRoster } = useAgentStream(dispatchMode, eventsPerSecond);
  const { filters, setFilters } = useFilters();
  const { agentId: selectedAgentId, select } = useSelectedAgent();
  const now = useNow(5000);

  const all = useMemo(() => (agents ? Array.from(agents.values()) : []), [agents]);
  const { queues, sites } = useMemo(() => distinctQueuesAndSites(all), [all]);
  const visible = useMemo(() => selectVisibleAgents(all, filters, now), [all, filters, now]);

  const onSort = useCallback((key: SortKey) => setFilters(nextSort(filters, key)), [filters, setFilters]);

  const selectedAgent = selectedAgentId ? agents?.get(selectedAgentId) ?? null : null;

  const grid = (
    <AgentGrid
      agents={visible}
      onSelect={select}
      sort={filters.sort}
      dir={filters.dir}
      onSort={onSort}
      selectedAgentId={selectedAgentId}
    />
  );

  return (
    <div className="pt-5 px-6 pb-20 max-w-350 mx-auto">
      <header className="flex items-center gap-4 mb-3 flex-wrap">
        <h1 className="text-lg m-0">Live Agent Monitoring</h1>
        <ConnectionBanner status={connectionStatus} />
      </header>

      {rosterState === "loading" && <LoadingState message="Loading roster…" />}

      {rosterState === "error" && (
        <ErrorState message="Couldn't load the agent roster." onRetry={retryRoster} />
      )}

      {rosterState === "ready" && agents && (
        <>
          <FilterBar queues={queues} sites={sites} visibleCount={visible.length} totalCount={all.length} />
          <SummaryBar agents={all} now={now} />
          {showPerfHud ? <PerfHud id="agent-grid">{grid}</PerfHud> : grid}
        </>
      )}

      {selectedAgent && (
        <AgentDetailPanel key={selectedAgent.agentId} agent={selectedAgent} onClose={() => select(null)} now={now} />
      )}
    </div>
  );
}
