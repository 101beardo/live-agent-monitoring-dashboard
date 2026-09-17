"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAgentStream } from "../hooks/useAgentStream";
import { useFilters, type SortKey } from "../hooks/useFilters";
import { useNow } from "../hooks/useNow";
import { distinctQueuesAndSites, nextSort, selectVisibleAgents } from "../lib/selectors";
import { ConnectionBanner } from "../components/ConnectionBanner";
import { FilterBar } from "../components/FilterBar";
import { SummaryBar } from "../components/SummaryBar";
import { AgentGrid } from "../components/AgentGrid";
import { AgentDetailPanel } from "../components/AgentDetailPanel";
import { PerfHud } from "../components/PerfHud";

function useSelectedAgent() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const agentId = params.get("agent");

  const select = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (id) next.set("agent", id);
      else next.delete("agent");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router]
  );

  return { agentId, select };
}

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

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Live Agent Monitoring</h1>
        <ConnectionBanner status={connectionStatus} />
      </header>

      {rosterState === "loading" && <div className="loading-state">Loading roster…</div>}

      {rosterState === "error" && (
        <div className="error-state">
          Couldn't load the agent roster.
          <button type="button" className="btn-ghost" onClick={retryRoster}>
            Retry
          </button>
        </div>
      )}

      {rosterState === "ready" && agents && (
        <>
          <FilterBar queues={queues} sites={sites} visibleCount={visible.length} totalCount={all.length} />
          <SummaryBar agents={all} now={now} />
          {showPerfHud ? (
            <PerfHud id="agent-grid">
              <AgentGrid agents={visible} onSelect={select} sort={filters.sort} dir={filters.dir} onSort={onSort} />
            </PerfHud>
          ) : (
            <AgentGrid agents={visible} onSelect={select} sort={filters.sort} dir={filters.dir} onSort={onSort} />
          )}
        </>
      )}

      {selectedAgent && <AgentDetailPanel agent={selectedAgent} onClose={() => select(null)} now={now} />}
    </div>
  );
}
