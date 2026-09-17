"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAgentStream } from "../hooks/useAgentStream";
import { useFilters, type SortKey } from "../hooks/useFilters";
import { useNow } from "../hooks/useNow";
import { deriveCombinedStatus } from "../lib/reconcile";
import type { AgentState } from "../lib/types";
import { ConnectionBanner } from "../components/ConnectionBanner";
import { FilterBar } from "../components/FilterBar";
import { SummaryBar } from "../components/SummaryBar";
import { AgentGrid } from "../components/AgentGrid";
import { AgentDetailPanel } from "../components/AgentDetailPanel";

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

function sortValue(agent: AgentState, key: SortKey, now: number) {
  switch (key) {
    case "name":
      return agent.name;
    case "queue":
      return agent.queues.join(", ");
    case "site":
      return agent.site;
    case "status":
      return deriveCombinedStatus(agent, now).kind;
    case "duration":
      return agent.callStartedAt ? now - new Date(agent.callStartedAt).getTime() : -1;
  }
}

export function Dashboard() {
  const { agents, connectionStatus, rosterState, retryRoster } = useAgentStream();
  const { filters, setFilters } = useFilters();
  const { agentId: selectedAgentId, select } = useSelectedAgent();
  const now = useNow(5000);

  const all = useMemo(() => (agents ? Array.from(agents.values()) : []), [agents]);

  const { queues, sites } = useMemo(() => {
    const q = new Set<string>();
    const s = new Set<string>();
    all.forEach((a) => {
      a.queues.forEach((x) => q.add(x));
      s.add(a.site);
    });
    return { queues: Array.from(q).sort(), sites: Array.from(s).sort() };
  }, [all]);

  const visible = useMemo(() => {
    let list = all;
    if (filters.state !== "all") {
      list = list.filter((a) => deriveCombinedStatus(a, now).kind === filters.state);
    }
    if (filters.queue !== "all") {
      list = list.filter((a) => a.queues.includes(filters.queue));
    }
    if (filters.site !== "all") {
      list = list.filter((a) => a.site === filters.site);
    }

    const sorted = [...list].sort((a, b) => {
      const av = sortValue(a, filters.sort, now);
      const bv = sortValue(b, filters.sort, now);
      if (av < bv) return filters.dir === "asc" ? -1 : 1;
      if (av > bv) return filters.dir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [all, filters, now]);

  const onSort = useCallback(
    (key: SortKey) => {
      setFilters({
        sort: key,
        dir: filters.sort === key && filters.dir === "asc" ? "desc" : "asc",
      });
    },
    [filters.sort, filters.dir, setFilters]
  );

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
          <AgentGrid agents={visible} onSelect={select} sort={filters.sort} dir={filters.dir} onSort={onSort} />
        </>
      )}

      {selectedAgent && <AgentDetailPanel agent={selectedAgent} onClose={() => select(null)} now={now} />}
    </div>
  );
}
