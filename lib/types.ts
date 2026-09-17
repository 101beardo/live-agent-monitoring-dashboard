/**
 * Domain types for the agent monitoring dashboard.
 *
 * Kept separate from the mock transport's raw event shape on purpose — the
 * reducer's job is to translate the wire format into these types, so nothing
 * downstream of the reducer needs to know the stream is a stream at all.
 */

export type DeviceStatus =
  | "Registered"
  | "Unregistered"
  | "Ringing"
  | "Answered"
  | "OnHold"
  | "CallEnded";

export type AgentStatus = "Available" | "OnBreak" | "AfterCallWork" | "LoggedOut";

export type Stream = "device" | "agent";

/** Raw shape delivered by mock/agentStream.js. This is the ONLY place `any`
 * would otherwise creep in, so it gets a real type immediately at the boundary. */
export interface RawStreamEvent {
  eventId: string;
  agentId: string;
  stream: Stream;
  status: DeviceStatus | AgentStatus;
  sequence: number;
  emittedAt: string;
  receivedAt?: string;
  callId?: string;
  queue?: string;
  hangupCause?: string;
  reason?: string;
  callerNumber?: string;
  direction?: "inbound" | "outbound";
  talkTimeSeconds?: number;
  resumedFromHold?: boolean;
}

export interface RosterAgent {
  agentId: string;
  name: string;
  extension: string;
  email: string;
  queues: string[];
  team: string;
  site: string;
  shiftStart: string;
  deviceStatus: DeviceStatus | null;
  agentStatus: AgentStatus | null;
  currentCallId: string | null;
  callStartedAt: string | null;
  statusChangedAt: string | null;
  snapshotSeq: number;
}

export interface RosterSnapshot {
  snapshotTakenAt: string;
  totalAgents: number;
  agents: RosterAgent[];
}

/**
 * Live, reconciled state for one agent — the reducer's output. Everything the
 * UI reads comes from here, never from raw events directly.
 */
export interface AgentState {
  agentId: string;
  name: string;
  extension: string;
  queues: string[];
  team: string;
  site: string;

  deviceStatus: DeviceStatus;
  agentStatus: AgentStatus;

  currentCallId: string | null;
  callStartedAt: string | null; // ISO — used to derive the live duration
  queue: string | null; // queue of the current/most recent call

  /** Highest `sequence` applied for this agent so far — the ordering guard. */
  lastSequence: number;
  /** Wall-clock time (receivedAt) of the last event actually applied. Used for
   * silent-device detection, not for ordering. */
  lastAppliedAt: string;
  /** Wall-clock time of the last *device* event specifically. If this stalls
   * while other agents keep moving, the device is presumed silent/stale. */
  lastDeviceEventAt: string | null;
}

/**
 * The single supervisor-actionable status. Deliberately a closed union rather
 * than a free-text label — every branch is a real decision a supervisor cares
 * about, not just a concatenation of the two raw states.
 */
export type CombinedStatus =
  | { kind: "on-call"; sub: "ringing" | "talking" | "on-hold" }
  | { kind: "wrapping-up" }
  | { kind: "available" }
  | { kind: "on-break"; }
  | { kind: "logged-out" }
  | { kind: "unreachable" } // agent says Available/OnBreak/AfterCallWork but device isn't Registered
  | { kind: "stale" }; // device has stopped emitting — state can no longer be trusted

export interface Call {
  callId: string;
  agentId: string;
  queue: string;
  startedAt: string;
  endedAt: string;
  talkTimeSeconds: number;
  holdTimeSeconds: number;
  hangupCause: string;
  answered: boolean;
  direction: "inbound" | "outbound";
  disposition: string;
}

export type ConnectionStatus = "connecting" | "open" | "closed";
