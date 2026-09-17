/**
 * Pure selection/derivation logic for the dashboard view — same reasoning as
 * reconcile.ts: no React, no hooks, so it can be unit tested directly and
 * reasoned about without a component tree. This used to live inline inside
 * Dashboard.tsx's useMemo callbacks, which meant "does filtering by state
 * actually work" was only checkable by clicking through the UI.
 */

import { deriveCombinedStatus } from "./reconcile";
import type { AgentState, Filters, SortKey } from "./types";

export function distinctQueuesAndSites(agents: AgentState[]): { queues: string[]; sites: string[] } {
  const q = new Set<string>();
  const s = new Set<string>();
  for (const a of agents) {
    a.queues.forEach((x) => q.add(x));
    s.add(a.site);
  }
  return { queues: Array.from(q).sort(), sites: Array.from(s).sort() };
}

/** The value each sort column actually compares on. Pulled out on its own
 * because "sort by status" and "sort by duration" both need deriveCombinedStatus
 * or a computed value, not a raw field — this is where that decision lives. */
export function sortValue(agent: AgentState, key: SortKey, now: number): string | number {
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

export function selectVisibleAgents(all: AgentState[], filters: Filters, now: number): AgentState[] {
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

  return [...list].sort((a, b) => {
    const av = sortValue(a, filters.sort, now);
    const bv = sortValue(b, filters.sort, now);
    if (av < bv) return filters.dir === "asc" ? -1 : 1;
    if (av > bv) return filters.dir === "asc" ? 1 : -1;
    return 0;
  });
}

export function nextSort(current: { sort: SortKey; dir: "asc" | "desc" }, key: SortKey) {
  return { sort: key, dir: current.sort === key && current.dir === "asc" ? ("desc" as const) : ("asc" as const) };
}
