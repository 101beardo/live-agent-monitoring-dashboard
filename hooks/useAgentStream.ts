"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { connect, fetchAgents } from "../lib/mockAdapter";
import { applyEvents, buildInitialAgentStates } from "../lib/reconcile";
import type { AgentState, ConnectionStatus, RawStreamEvent, RosterSnapshot } from "../lib/types";

type AgentsAction =
  | { type: "ROSTER_LOADED"; roster: RosterSnapshot }
  | { type: "EVENTS"; events: RawStreamEvent[] };

function agentsReducer(
  state: Map<string, AgentState> | null,
  action: AgentsAction
): Map<string, AgentState> | null {
  switch (action.type) {
    case "ROSTER_LOADED":
      return buildInitialAgentStates(action.roster, new Date().toISOString());
    case "EVENTS":
      return state ? applyEvents(state, action.events) : state;
    default:
      return state;
  }
}

export type RosterLoadState = "loading" | "error" | "ready";

/**
 * Owns the roster fetch + the live stream, and is the ONLY place that
 * dispatches into the reducer.
 *
 * Render-cost decision worth calling out: incoming events are NOT dispatched
 * one at a time. At 25 events/sec that would already mean 25 state updates a
 * second on a 300-row grid; the brief says production peaks near 8,000/sec,
 * where that approach falls over completely. Instead, events are pushed into
 * a ref (no re-render) and flushed into the reducer in one batched dispatch
 * per animation frame — render rate is capped at the display's refresh rate
 * regardless of how fast events arrive. The "reflected within about a
 * second" requirement is met with a huge margin either way.
 *
 * `dispatchMode: "naive"` deliberately reintroduces the per-event dispatch
 * this hook exists to avoid, gated behind `?dispatch=naive` and wired to the
 * on-screen perf HUD (see PerfHud.tsx) — a real before/after to point at
 * instead of just asserting the batching helps. Measured numbers are in the
 * README's performance section.
 */
export function useAgentStream(dispatchMode: "batched" | "naive" = "batched", eventsPerSecond?: number) {
  const [agents, dispatch] = useReducer(agentsReducer, null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [rosterState, setRosterState] = useState<RosterLoadState>("loading");
  const pendingRef = useRef<RawStreamEvent[]>([]);

  const loadRoster = useCallback(async () => {
    setRosterState("loading");
    try {
      const roster = await fetchAgents();
      dispatch({ type: "ROSTER_LOADED", roster });
      setRosterState("ready");
    } catch {
      setRosterState("error");
    }
  }, []);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  useEffect(() => {
    if (rosterState !== "ready") return;

    if (dispatchMode === "naive") {
      // One dispatch per event, on purpose — this is the thing the batched
      // path exists to avoid. Kept alive behind a flag instead of deleted so
      // the render-cost claim is something you can actually toggle and watch,
      // not just prose in a README.
      const conn = connect({
        onEvent: (event) => dispatch({ type: "EVENTS", events: [event] }),
        onStatusChange: setConnectionStatus,
        eventsPerSecond,
      });
      return () => {
        conn.close();
      };
    }

    const conn = connect({
      onEvent: (event) => {
        pendingRef.current.push(event);
      },
      onStatusChange: setConnectionStatus,
      eventsPerSecond,
    });

    let raf = 0;
    const flush = () => {
      if (pendingRef.current.length > 0) {
        const batch = pendingRef.current;
        pendingRef.current = [];
        dispatch({ type: "EVENTS", events: batch });
      }
      raf = requestAnimationFrame(flush);
    };
    raf = requestAnimationFrame(flush);

    return () => {
      conn.close();
      cancelAnimationFrame(raf);
    };
  }, [rosterState, dispatchMode, eventsPerSecond]);

  return { agents, connectionStatus, rosterState, retryRoster: loadRoster };
}
