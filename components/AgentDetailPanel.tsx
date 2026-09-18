"use client";

import { useState } from "react";
import { PAGE_SIZE, useAgentCalls } from "../hooks/useAgentCalls";
import type { AgentState } from "../lib/types";
import { formatDuration } from "../lib/format";
import { StatusPill } from "./StatusPill";
import { deriveCombinedStatus } from "../lib/reconcile";
import { LoadingState } from "./LoadingState";
import { ErrorState } from "./ErrorState";
import { EmptyState } from "./EmptyState";

export function AgentDetailPanel({ agent, onClose, now }: { agent: AgentState; onClose: () => void; now: number }) {
  const [page, setPage] = useState(0);
  const { data, isLoading, isError, isFetching, refetch } = useAgentCalls(agent.agentId, page);
  const status = deriveCombinedStatus(agent, now);

  // fetchCalls returns no total count (a known gap — see README), so "next"
  // is disabled by inference: a short page means we've reached the end.
  const hasNext = (data?.calls.length ?? 0) === PAGE_SIZE;

  return (
    <div className="detail-panel" role="dialog" aria-label={`${agent.name} details`}>
      <div className="flex justify-between items-start mb-2.5">
        <div>
          <h2 className="mb-1 mt-0 text-base">{agent.name}</h2>
          <div className="text-muted text-xs">
            Ext {agent.extension} · {agent.site} · {agent.queues.join(", ")}
          </div>
        </div>
        <button type="button" className="btn-ghost" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="flex items-center gap-2.5 my-2.5 mb-4.5">
        <StatusPill status={status} />
        <span className="mono">
          device: {agent.deviceStatus} · agent: {agent.agentStatus}
        </span>
      </div>

      <h3>Recent calls</h3>

      {isLoading && <LoadingState message="Loading call history…" />}

      {isError && <ErrorState message="Couldn't load call history." onRetry={() => refetch()} />}

      {data && data.calls.length === 0 && page === 0 && (
        <EmptyState message="No call history for this agent yet." />
      )}

      {data && data.calls.length > 0 && (
        <ul className="list-none p-0 m-0">
          {data.calls.map((c) => (
            <li key={c.callId} className="py-2 border-b border-border">
              <div>
                <b>{c.queue}</b> · {c.disposition}
                {isFetching && <span className="mono text-muted"> (updating…)</span>}
              </div>
              <div className="mono text-muted">
                {new Date(c.startedAt).toLocaleString()} · talk {formatDuration(c.talkTimeSeconds)}
                {c.holdTimeSeconds > 0 ? ` · hold ${formatDuration(c.holdTimeSeconds)}` : ""} · {c.hangupCause}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2.5 mt-3.5">
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
