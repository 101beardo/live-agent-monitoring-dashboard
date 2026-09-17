"use client";

import type { CombinedStatus } from "../lib/types";
import { useFilters } from "../hooks/useFilters";

const STATE_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All states" },
  { value: "on-call", label: "On call" },
  { value: "wrapping-up", label: "Wrapping up" },
  { value: "available", label: "Available" },
  { value: "on-break", label: "On break" },
  { value: "logged-out", label: "Logged out" },
  { value: "unreachable", label: "Unreachable" },
  { value: "stale", label: "Stale" },
] satisfies { value: "all" | CombinedStatus["kind"]; label: string }[];

export function FilterBar({
  queues,
  sites,
  visibleCount,
  totalCount,
}: {
  queues: string[];
  sites: string[];
  visibleCount: number;
  totalCount: number;
}) {
  const { filters, setFilters } = useFilters();

  return (
    <div className="filter-bar">
      <select
        aria-label="Filter by state"
        value={filters.state}
        onChange={(e) => setFilters({ state: e.target.value })}
      >
        {STATE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <select
        aria-label="Filter by queue"
        value={filters.queue}
        onChange={(e) => setFilters({ queue: e.target.value })}
      >
        <option value="all">All queues</option>
        {queues.map((q) => (
          <option key={q} value={q}>
            {q}
          </option>
        ))}
      </select>

      <select
        aria-label="Filter by site"
        value={filters.site}
        onChange={(e) => setFilters({ site: e.target.value })}
      >
        <option value="all">All sites</option>
        {sites.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      {(filters.state !== "all" || filters.queue !== "all" || filters.site !== "all") && (
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setFilters({ state: "all", queue: "all", site: "all" })}
        >
          Clear filters
        </button>
      )}

      <span className="filter-count">
        {visibleCount} / {totalCount} agents
      </span>
    </div>
  );
}
