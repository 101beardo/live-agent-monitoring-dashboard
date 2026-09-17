/**
 * The only file that imports mock/agentStream.js directly.
 *
 * Everything else in the app depends on this module's typed exports, not on
 * the mock package itself. Swapping in a real WebSocket + REST backend later
 * means rewriting this one file — nothing in hooks/ or components/ changes.
 *
 * mock/agentStream.js is untyped JS (we were told not to modify it), so this
 * file is also where the stream boundary gets real types instead of `any`.
 */

import * as raw from "../mock/agentStream";
import type { Call, ConnectionStatus, RawStreamEvent, RosterSnapshot } from "./types";

export interface ConnectOptions {
  onEvent?: (event: RawStreamEvent) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
  eventsPerSecond?: number;
  dropoutEveryMs?: number;
  dropoutDurationMs?: number;
  replayOnReconnect?: number;
  jitterMs?: number;
  loop?: boolean;
}

export interface Connection {
  close(): void;
}

export const connect: (options?: ConnectOptions) => Connection = raw.connect;

export const fetchAgents: () => Promise<RosterSnapshot> = raw.fetchAgents;

export const fetchCalls: (args?: {
  agentId?: string;
  offset?: number;
  limit?: number;
}) => Promise<{ calls: Call[]; offset: number; limit: number }> = raw.fetchCalls;
