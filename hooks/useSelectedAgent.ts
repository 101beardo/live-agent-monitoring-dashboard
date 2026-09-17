"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * The selected agent lives in the URL's `?agent=` param, not component state —
 * same reasoning as useFilters: a supervisor can send a colleague a link
 * straight to one agent's panel, and the selection survives a refresh.
 *
 * router.replace (not push) so opening/closing the panel doesn't spam the
 * browser's back button with one history entry per click.
 */
export function useSelectedAgent() {
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
