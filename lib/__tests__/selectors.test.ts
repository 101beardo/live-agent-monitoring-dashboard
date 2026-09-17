import { describe, expect, it } from "vitest";
import { distinctQueuesAndSites, nextSort, selectVisibleAgents } from "../selectors";
import type { AgentState } from "../types";

function agent(overrides: Partial<AgentState>): AgentState {
  return {
    agentId: "AG-1",
    name: "Base",
    extension: "2000",
    queues: ["Billing"],
    team: "Team Alpha",
    site: "Bangalore",
    deviceStatus: "Registered",
    agentStatus: "Available",
    currentCallId: null,
    callStartedAt: null,
    queue: null,
    lastSequence: 1,
    lastAppliedAt: "2026-09-09T09:00:00Z",
    lastDeviceEventAt: "2026-09-09T09:00:00Z",
    ...overrides,
  };
}

const NOW = new Date("2026-09-09T09:00:05Z").getTime();

describe("distinctQueuesAndSites", () => {
  it("dedupes and sorts across all agents' queues and sites", () => {
    const agents = [
      agent({ agentId: "AG-1", queues: ["Sales", "Billing"], site: "London" }),
      agent({ agentId: "AG-2", queues: ["Billing"], site: "Bangalore" }),
    ];
    expect(distinctQueuesAndSites(agents)).toEqual({
      queues: ["Billing", "Sales"],
      sites: ["Bangalore", "London"],
    });
  });
});

describe("selectVisibleAgents", () => {
  const agents = [
    agent({ agentId: "AG-1", name: "Zoe", site: "London", queues: ["Sales"], agentStatus: "Available", deviceStatus: "Registered" }),
    agent({ agentId: "AG-2", name: "Amir", site: "Bangalore", queues: ["Billing"], agentStatus: "OnBreak" }),
    agent({ agentId: "AG-3", name: "Mia", site: "Bangalore", queues: ["Billing", "Sales"], deviceStatus: "Ringing" }),
  ];
  const baseFilters = { state: "all", queue: "all", site: "all", sort: "name" as const, dir: "asc" as const };

  it("filters by combined status", () => {
    const result = selectVisibleAgents(agents, { ...baseFilters, state: "on-break" }, NOW);
    expect(result.map((a) => a.agentId)).toEqual(["AG-2"]);
  });

  it("filters by queue membership (agent can be in multiple)", () => {
    const result = selectVisibleAgents(agents, { ...baseFilters, queue: "Sales" }, NOW);
    expect(result.map((a) => a.agentId).sort()).toEqual(["AG-1", "AG-3"]);
  });

  it("filters by site", () => {
    const result = selectVisibleAgents(agents, { ...baseFilters, site: "Bangalore" }, NOW);
    expect(result.map((a) => a.agentId).sort()).toEqual(["AG-2", "AG-3"]);
  });

  it("combines filters (AND, not OR)", () => {
    const result = selectVisibleAgents(agents, { ...baseFilters, site: "Bangalore", queue: "Sales" }, NOW);
    expect(result.map((a) => a.agentId)).toEqual(["AG-3"]);
  });

  it("sorts by name ascending by default, and descending when asked", () => {
    const asc = selectVisibleAgents(agents, baseFilters, NOW).map((a) => a.name);
    expect(asc).toEqual(["Amir", "Mia", "Zoe"]);

    const desc = selectVisibleAgents(agents, { ...baseFilters, dir: "desc" }, NOW).map((a) => a.name);
    expect(desc).toEqual(["Zoe", "Mia", "Amir"]);
  });

  it("does not mutate the input array (sorts a copy)", () => {
    const original = [...agents];
    selectVisibleAgents(agents, { ...baseFilters, dir: "desc" }, NOW);
    expect(agents).toEqual(original);
  });
});

describe("nextSort", () => {
  it("flips direction when re-clicking the already-active column", () => {
    expect(nextSort({ sort: "name", dir: "asc" }, "name")).toEqual({ sort: "name", dir: "desc" });
    expect(nextSort({ sort: "name", dir: "desc" }, "name")).toEqual({ sort: "name", dir: "asc" });
  });

  it("resets to ascending when switching to a different column", () => {
    expect(nextSort({ sort: "name", dir: "desc" }, "site")).toEqual({ sort: "site", dir: "asc" });
  });
});
