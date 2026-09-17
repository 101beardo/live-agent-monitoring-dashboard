"use client";

import { useState } from "react";
import { PAGE_SIZE, useAgentCalls } from "../hooks/useAgentCalls";
import type { AgentState } from "../lib/types";
import { formatDuration } from "../lib/format";
import { StatusPill } from "./StatusPill";
import { deriveCombinedStatus } from "../lib/reconcile";

export function AgentDetailPanel({ agent, onClose, now }: { agent: AgentState; onClose: () => void; now: number }) {
  const [page, setPage] = useState(0);
  const { data, isLoading, isError, isFetching, refetch } = useAgentCalls(agent.agentId, page);
  const status = deriveCombinedStatus(agent, now);

  // fetchCalls returns no total count (a known gap — see README), so "next"
  // is disabled by inference: a short page means we've reached the end.
  const hasNext = (data?.calls.length ?? 0) === PAGE_SIZE;

  return (
    <div className="detail-panel" role="dialog" aria-label={`${agent.name} details`}>
      <div className="detail-header">
        <div>
          <h2>{agent.name}</h2>
          <div className="detail-sub">
            Ext {agent.extension} · {agent.site} · {agent.queues.join(", ")}
          </div>
        </div>
        <button type="button" className="btn-ghost" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="detail-status">
        <StatusPill status={status} />
        <span className="mono">
          device: {agent.deviceStatus} · agent: {agent.agentStatus}
        </span>
      </div>

      <h3>Recent calls</h3>

      {isLoading && <div className="loading-state">Loading call history…</div>}

      {isError && (
        <div className="error-state">
          Couldn't load call history.
          <button type="button" className="btn-ghost" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      )}

      {data && data.calls.length === 0 && page === 0 && (
        <div className="empty-state">No call history for this agent yet.</div>
      )}

      {data && data.calls.length > 0 && (
        <ul className="call-list">
          {data.calls.map((c) => (
            <li key={c.callId} className="call-row">
              <div>
                <b>{c.queue}</b> · {c.disposition}
                {isFetching && <span className="mono muted"> (updating…)</span>}
              </div>
              <div className="mono muted">
                {new Date(c.startedAt).toLocaleString()} · talk {formatDuration(c.talkTimeSeconds)}
                {c.holdTimeSeconds > 0 ? ` · hold ${formatDuration(c.holdTimeSeconds)}` : ""} · {c.hangupCause}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="pager">
        <button type="button" className="btn-ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          Prev
        </button>
        <span className="mono">page {page + 1}</span>
        <button type="button" className="btn-ghost" disabled={!hasNext} onClick={() => setPage((p) => p + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
