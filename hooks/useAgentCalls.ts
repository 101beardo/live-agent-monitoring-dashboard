"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchCalls } from "../lib/mockAdapter";

export const PAGE_SIZE = 10;

export function useAgentCalls(agentId: string | null, page: number) {
  return useQuery({
    queryKey: ["calls", agentId, page],
    enabled: agentId !== null,
    queryFn: () => fetchCalls({ agentId: agentId ?? undefined, offset: page * PAGE_SIZE, limit: PAGE_SIZE }),
    // fetchCalls fails ~8% of the time by design; a couple of quick retries
    // absorbs that without the user noticing, real failures still surface.
    retry: 2,
    retryDelay: (attempt) => 300 * 2 ** attempt,
    staleTime: 30_000,
  });
}
