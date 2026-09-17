"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import type { Filters, SortDir, SortKey } from "../lib/types";

const DEFAULTS: Filters = { state: "all", queue: "all", site: "all", sort: "name", dir: "asc" };

/** Whether any of the three filter fields (state/queue/site — not sort/dir)
 * differ from default. The single source of truth for "is a filter active,"
 * so callers like FilterBar's Clear-filters button never hardcode "all". */
export function hasActiveFilters(filters: Filters): boolean {
  return filters.state !== DEFAULTS.state || filters.queue !== DEFAULTS.queue || filters.site !== DEFAULTS.site;
}

/**
 * Filter/sort state lives in the URL, not component state — requirement 4
 * ("filters must survive a page refresh") is really a state-architecture
 * decision, not a localStorage workaround. It also means a supervisor can
 * paste a filtered URL to a colleague and land on the same view, which the
 * brief lists as a nice-to-have for free.
 *
 * router.replace (not push) is used so adjusting a filter doesn't spam the
 * browser's back button with one entry per click.
 */
export function useFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const filters = useMemo<Filters>(
    () => ({
      state: params.get("state") ?? DEFAULTS.state,
      queue: params.get("queue") ?? DEFAULTS.queue,
      site: params.get("site") ?? DEFAULTS.site,
      sort: (params.get("sort") as SortKey) ?? DEFAULTS.sort,
      dir: (params.get("dir") as SortDir) ?? DEFAULTS.dir,
    }),
    [params]
  );

  const setFilters = useCallback(
    (patch: Partial<Filters>) => {
      const next = new URLSearchParams(params.toString());
      const merged = { ...filters, ...patch };
      (Object.keys(merged) as (keyof Filters)[]).forEach((key) => {
        if (merged[key] === DEFAULTS[key]) next.delete(key);
        else next.set(key, merged[key]);
      });
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [filters, params, pathname, router]
  );

  return { filters, setFilters };
}
