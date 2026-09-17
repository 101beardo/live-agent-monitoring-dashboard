"use client";

import type { CombinedStatus } from "../lib/types";
import { hasActiveFilters, useFilters } from "../hooks/useFilters";

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
    <div className="flex items-center gap-2.5 mt-3.5 mb-2.5 flex-wrap">
      <select
        aria-label="Filter by state"
        className="bg-panel text-ink border border-border rounded-md px-2 py-1.5"
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
        className="bg-panel text-ink border border-border rounded-md px-2 py-1.5"
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
        className="bg-panel text-ink border border-border rounded-md px-2 py-1.5"
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

      {hasActiveFilters(filters) && (
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setFilters({ state: "all", queue: "all", site: "all" })}
        >
          Clear filters
        </button>
      )}

      <span className="text-muted ml-auto">
        {visibleCount} / {totalCount} agents
      </span>
    </div>
  );
}
