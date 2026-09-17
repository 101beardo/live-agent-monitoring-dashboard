"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { connect, fetchAgents, type Connection } from "../lib/mockAdapter";
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
 */
export function useAgentStream() {
  const [agents, dispatch] = useReducer(agentsReducer, null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [rosterState, setRosterState] = useState<RosterLoadState>("loading");
  const pendingRef = useRef<RawStreamEvent[]>([]);
  const connRef = useRef<Connection | null>(null);

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

    const conn = connect({
      onEvent: (event) => {
        pendingRef.current.push(event);
      },
      onStatusChange: setConnectionStatus,
    });
    connRef.current = conn;

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
      connRef.current = null;
    };
  }, [rosterState]);

  return { agents, connectionStatus, rosterState, retryRoster: loadRoster };
}
