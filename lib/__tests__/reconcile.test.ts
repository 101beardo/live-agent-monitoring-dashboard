import { describe, expect, it } from "vitest";
import { applyEvent, applyEvents, buildInitialAgentStates, deriveCombinedStatus, STALE_THRESHOLD_MS } from "../reconcile";
import type { AgentState, RawStreamEvent, RosterSnapshot } from "../types";

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
  it("Ringing sets currentCallId and anchors callStartedAt on receivedAt, not the simulated emittedAt", () => {
    const states = new Map([["AG-1000", baseAgent({ lastSequence: 5, currentCallId: null })]]);
    const next = applyEvent(
      states,
      event({
        sequence: 6,
        status: "Ringing",
        callId: "CALL-42",
        emittedAt: "2026-09-09T09:05:00Z", // simulated-timeline value — must NOT be used
        receivedAt: "2026-09-17T10:00:00Z", // real wall-clock value — must be used
      })
    );
    const a = next.get("AG-1000")!;
    expect(a.currentCallId).toBe("CALL-42");
    expect(a.callStartedAt).toBe("2026-09-17T10:00:00Z");
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

describe("applyEvent — boundary case", () => {
  it("discards an event whose sequence exactly equals lastSequence, not just lower", () => {
    // Off-by-one is the classic place this guard breaks: <= must be used,
    // not <, or the very next legitimate event after a duplicate gets stuck.
    const states = new Map([["AG-1000", baseAgent({ lastSequence: 6 })]]);
    const next = applyEvent(states, event({ sequence: 6 }));
    expect(next).toBe(states);
  });
});

describe("applyEvents — batches with internal disorder", () => {
  it("applies a batch out of order correctly regardless of array order", () => {
    // requestAnimationFrame flushes whatever landed in the ref buffer since
    // the last frame — that buffer can itself contain events out of sequence
    // order for the same agent. applyEvents must not assume the array it's
    // handed is already sorted.
    const states = new Map([["AG-1000", baseAgent({ lastSequence: 5 })]]);
    const batch: RawStreamEvent[] = [
      event({ eventId: "e1", sequence: 8, status: "Answered", callId: "CALL-1" }),
      event({ eventId: "e2", sequence: 6, status: "Ringing", callId: "CALL-1" }),
      event({ eventId: "e3", sequence: 7, status: "Ringing", callId: "CALL-1" }), // duplicate-ish, lower than e1
    ];
    const next = applyEvents(states, batch);
    const a = next.get("AG-1000")!;
    // The array-order-first event (sequence 8) wins because applyEvent only
    // ever accepts a strictly higher sequence than what's already applied —
    // once 8 lands, the later-processed 6 and 7 are both discarded even
    // though they appear "before" it in wall-clock terms. Documented in
    // reconcile.ts: we never fabricate an intermediate state.
    expect(a.lastSequence).toBe(8);
    expect(a.deviceStatus).toBe("Answered");
  });
});

describe("buildInitialAgentStates — simulated-to-wall-clock offset", () => {
  function roster(overrides: Partial<RosterSnapshot["agents"][number]> = {}): RosterSnapshot {
    return {
      snapshotTakenAt: "2026-09-09T09:00:00Z", // the mock's fixed simulated timeline
      totalAgents: 1,
      agents: [
        {
          agentId: "AG-1000",
          name: "Test Agent",
          extension: "2000",
          email: "test@example-cx.com",
          queues: ["Billing"],
          team: "Team Alpha",
          site: "Bangalore",
          shiftStart: "09:00",
          deviceStatus: "Ringing",
          agentStatus: "Available",
          currentCallId: "CALL-1",
          callStartedAt: "2026-09-09T08:57:00Z", // 3 minutes before the simulated snapshot
          statusChangedAt: "2026-09-09T08:57:00Z",
          snapshotSeq: 3,
          ...overrides,
        },
      ],
    };
  }

  it("shifts an in-progress call's callStartedAt by the real elapsed offset, not to zero", () => {
    const realNow = "2026-09-17T10:00:00Z"; // days after the simulated snapshot
    const states = buildInitialAgentStates(roster(), realNow);
    const a = states.get("AG-1000")!;
    // 3 minutes before the simulated snapshot -> 3 minutes before real "now",
    // i.e. the call should still read as ~3 minutes in, not brand new.
    expect(a.callStartedAt).toBe("2026-09-17T09:57:00.000Z");
  });

  it("seeds staleness tracking at real 'now', not the simulated snapshot time", () => {
    const realNow = "2026-09-17T10:00:00Z";
    const states = buildInitialAgentStates(roster(), realNow);
    const a = states.get("AG-1000")!;
    expect(a.lastDeviceEventAt).toBe(realNow);
    expect(a.lastAppliedAt).toBe(realNow);
  });

  it("leaves callStartedAt null for an agent who isn't on a call", () => {
    const realNow = "2026-09-17T10:00:00Z";
    const states = buildInitialAgentStates(
      roster({ currentCallId: null, callStartedAt: null, deviceStatus: "Registered" }),
      realNow
    );
    expect(states.get("AG-1000")!.callStartedAt).toBeNull();
  });
});
