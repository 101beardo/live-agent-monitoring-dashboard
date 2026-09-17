import { describe, expect, it } from "vitest";
import { applyEvent, deriveCombinedStatus, STALE_THRESHOLD_MS } from "../reconcile";
import type { AgentState, RawStreamEvent } from "../types";

function baseAgent(overrides: Partial<AgentState> = {}): AgentState {
  return {
    agentId: "AG-1000",
    name: "Test Agent",
    extension: "2000",
    queues: ["Billing"],
    team: "Team Alpha",
    site: "Bangalore",
    deviceStatus: "Registered",
    agentStatus: "Available",
    currentCallId: null,
    callStartedAt: null,
    queue: null,
    lastSequence: 5,
    lastAppliedAt: "2026-09-09T09:00:00Z",
    lastDeviceEventAt: "2026-09-09T09:00:00Z",
    ...overrides,
  };
}

function event(overrides: Partial<RawStreamEvent>): RawStreamEvent {
  return {
    eventId: "EVT-1",
    agentId: "AG-1000",
    stream: "device",
    status: "Ringing",
    sequence: 6,
    emittedAt: "2026-09-09T09:01:00Z",
    receivedAt: "2026-09-09T09:01:01Z",
    ...overrides,
  };
}

describe("applyEvent — ordering guard", () => {
  it("discards a duplicate event (same sequence already applied)", () => {
    const states = new Map([["AG-1000", baseAgent({ lastSequence: 6 })]]);
    const next = applyEvent(states, event({ sequence: 6, status: "CallEnded" }));
    expect(next).toBe(states); // untouched — same reference, no re-render triggered
  });

  it("discards a stale/out-of-order event with sequence <= snapshotSeq baseline", () => {
    const states = new Map([["AG-1000", baseAgent({ lastSequence: 10 })]]);
    const next = applyEvent(states, event({ sequence: 3 }));
    expect(next.get("AG-1000")?.lastSequence).toBe(10);
  });

  it("applies an event with a higher sequence and advances lastSequence", () => {
    const states = new Map([["AG-1000", baseAgent({ lastSequence: 5 })]]);
    const next = applyEvent(states, event({ sequence: 6, status: "Ringing", callId: "CALL-1", queue: "Sales" }));
    const a = next.get("AG-1000")!;
    expect(a.lastSequence).toBe(6);
    expect(a.currentCallId).toBe("CALL-1");
    expect(a.queue).toBe("Sales");
  });

  it("ignores events for an agent not in the roster", () => {
    const states = new Map([["AG-1000", baseAgent()]]);
    const next = applyEvent(states, event({ agentId: "AG-9999" }));
    expect(next).toBe(states);
  });
});

describe("applyEvent — call lifecycle", () => {
  it("Ringing sets currentCallId and callStartedAt from emittedAt", () => {
    const states = new Map([["AG-1000", baseAgent({ lastSequence: 5, currentCallId: null })]]);
    const next = applyEvent(
      states,
      event({ sequence: 6, status: "Ringing", callId: "CALL-42", emittedAt: "2026-09-09T09:05:00Z" })
    );
    const a = next.get("AG-1000")!;
    expect(a.currentCallId).toBe("CALL-42");
    expect(a.callStartedAt).toBe("2026-09-09T09:05:00Z");
  });

  it("CallEnded clears currentCallId and callStartedAt", () => {
    const states = new Map([
      ["AG-1000", baseAgent({ lastSequence: 5, currentCallId: "CALL-42", callStartedAt: "2026-09-09T09:05:00Z" })],
    ]);
    const next = applyEvent(states, event({ sequence: 6, status: "CallEnded", callId: "CALL-42" }));
    const a = next.get("AG-1000")!;
    expect(a.currentCallId).toBeNull();
    expect(a.callStartedAt).toBeNull();
  });

  it("OnHold does not clear callStartedAt", () => {
    const states = new Map([
      ["AG-1000", baseAgent({ lastSequence: 5, currentCallId: "CALL-42", callStartedAt: "2026-09-09T09:05:00Z" })],
    ]);
    const next = applyEvent(states, event({ sequence: 6, status: "OnHold", callId: "CALL-42" }));
    expect(next.get("AG-1000")?.callStartedAt).toBe("2026-09-09T09:05:00Z");
  });
});

describe("deriveCombinedStatus", () => {
  // 5s after baseAgent's default lastDeviceEventAt — well inside the stale
  // threshold, so tests that aren't specifically about staleness stay clean.
  const now = new Date("2026-09-09T09:00:05Z").getTime();

  it("mid-call dominates regardless of agentStatus", () => {
    const a = baseAgent({ deviceStatus: "Ringing", agentStatus: "AfterCallWork" });
    expect(deriveCombinedStatus(a, now)).toEqual({ kind: "on-call", sub: "ringing" });
  });

  it("flags the Available-but-Unregistered mismatch from the brief", () => {
    const a = baseAgent({ deviceStatus: "Unregistered", agentStatus: "Available" });
    expect(deriveCombinedStatus(a, now)).toEqual({ kind: "unreachable" });
  });

  it("Available + Registered is the clean ready state", () => {
    const a = baseAgent({ deviceStatus: "Registered", agentStatus: "Available" });
    expect(deriveCombinedStatus(a, now)).toEqual({ kind: "available" });
  });

  it("marks an agent stale once its device has gone silent past the threshold", () => {
    const staleSince = new Date(now - STALE_THRESHOLD_MS - 1000).toISOString();
    const a = baseAgent({ deviceStatus: "Registered", agentStatus: "Available", lastDeviceEventAt: staleSince });
    expect(deriveCombinedStatus(a, now)).toEqual({ kind: "stale" });
  });

  it("does not mark a LoggedOut agent as stale even with an old lastDeviceEventAt", () => {
    const staleSince = new Date(now - STALE_THRESHOLD_MS - 1000).toISOString();
    const a = baseAgent({ agentStatus: "LoggedOut", lastDeviceEventAt: staleSince });
    expect(deriveCombinedStatus(a, now)).toEqual({ kind: "logged-out" });
  });
});
