/**
 * Mock real-time transport for the Agent Monitoring assignment.
 *
 * This stands in for a production WebSocket. Do not modify this file — treat it
 * as an external system you do not control. It is deliberately unreliable in the
 * same ways our real telephony event stream is:
 *
 *   - events arrive out of order
 *   - events are occasionally delivered more than once
 *   - the connection drops periodically and reconnects
 *   - after a reconnect, you may receive events you have already seen
 *   - some events arrive long after they were emitted
 *   - a few agents' devices have skewed clocks, so `emittedAt` is not a
 *     reliable ordering key. `sequence` is monotonic per agent.
 *
 * Usage:
 *
 *   import { connect, fetchAgents, fetchCalls } from './mock/agentStream';
 *
 *   const conn = connect({
 *     onEvent: (event) => { ... },
 *     onStatusChange: (status) => { ... },   // 'connecting' | 'open' | 'closed'
 *   });
 *
 *   conn.close();
 */

import eventLog from './events.json';
import roster from './agents.json';
import callLog from './calls.json';

const DEFAULTS = {
  eventsPerSecond: 25,      // raise this to test render cost under load
  dropoutEveryMs: 45000,    // connection drops on this interval
  dropoutDurationMs: 8000,  // ...and stays down this long
  replayOnReconnect: 40,    // events re-sent after reconnect (may be duplicates)
  jitterMs: 400,            // random per-event delivery delay
  loop: true,               // restart the log when it runs out
};

export function connect(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const { onEvent, onStatusChange } = cfg;

  let cursor = 0;
  let closed = false;
  let tickTimer = null;
  let dropTimer = null;
  const pending = new Set();

  const emit = (event) => {
    const delay = Math.random() * cfg.jitterMs;
    const t = setTimeout(() => {
      pending.delete(t);
      if (!closed) onEvent?.({ ...event, receivedAt: new Date().toISOString() });
    }, delay);
    pending.add(t);
  };

  const open = () => {
    onStatusChange?.('open');

    const interval = 1000 / cfg.eventsPerSecond;
    tickTimer = setInterval(() => {
      if (cursor >= eventLog.length) {
        if (!cfg.loop) return;
        cursor = 0;
      }
      emit(eventLog[cursor++]);
    }, interval);

    dropTimer = setTimeout(() => {
      clearInterval(tickTimer);
      onStatusChange?.('closed');

      setTimeout(() => {
        if (closed) return;
        onStatusChange?.('connecting');
        // replay a window of recent events — some will be duplicates
        cursor = Math.max(0, cursor - cfg.replayOnReconnect);
        open();
      }, cfg.dropoutDurationMs);
    }, cfg.dropoutEveryMs);
  };

  onStatusChange?.('connecting');
  setTimeout(open, 300);

  return {
    close() {
      closed = true;
      clearInterval(tickTimer);
      clearTimeout(dropTimer);
      pending.forEach(clearTimeout);
      pending.clear();
      onStatusChange?.('closed');
    },
  };
}

/**
 * Initial roster snapshot. Resolves after a realistic delay and fails
 * occasionally, like a real endpoint.
 *
 * NOTE: each agent carries a `snapshotSeq`. Any event for that agent with a
 * `sequence` at or below it predates this snapshot.
 */
export function fetchAgents() {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (Math.random() < 0.1) return reject(new Error('503 Service Unavailable'));
      resolve(structuredClone(roster));
    }, 400 + Math.random() * 900);
  });
}

/**
 * Call history for the detail panel. Offset paginated, unsorted, and returns no
 * total count — this is exactly the shape our backend currently offers.
 */
export function fetchCalls({ agentId, offset = 0, limit = 20 } = {}) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (Math.random() < 0.08) return reject(new Error('500 Internal Server Error'));
      const all = callLog.calls.filter((c) => !agentId || c.agentId === agentId);
      const page = all.slice(offset, offset + limit);
      resolve({ calls: page, offset, limit });
    }, 300 + Math.random() * 700);
  });
}
