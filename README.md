# Live Agent Monitoring Dashboard — Take-Home Assignment

Read `Senior_Frontend_Engineer_Take_Home.pdf` first. It contains the full brief,
the requirements, and how we assess the submission.

## Quick start

```bash
npm install
npm run dev
```

There is no backend to start. Everything is served from the files in `mock/`.

## What's in `mock/`

| File | Purpose |
|---|---|
| `agents.json` | Roster snapshot — 300 agents and their state at snapshot time |
| `events.json` | Real-time event log in delivery order (~8,500 events) |
| `calls.json` | Historical call records for the agent detail panel |
| `agentStream.js` | Mock transport — `connect()`, `fetchAgents()`, `fetchCalls()` |

**Do not modify anything in `mock/`.** Treat it as an external system you do not
control. If you need different behaviour to test something, use the options that
`connect()` accepts:

```js
import { connect, fetchAgents, fetchCalls } from './mock/agentStream';

const conn = connect({
  onEvent: (event) => { /* ... */ },
  onStatusChange: (status) => { /* 'connecting' | 'open' | 'closed' */ },

  // optional — tune while developing, note it in your README if you change it
  eventsPerSecond: 25,
  dropoutEveryMs: 45000,
  dropoutDurationMs: 8000,
  jitterMs: 400,
});

conn.close();
```

## Things worth knowing before you design

The stream is deliberately unreliable, in the same ways ours is in production:

- Events for the same agent can arrive **out of order**
- Events are sometimes **delivered more than once**
- The connection **drops periodically** and replays a window on reconnect
- Some events arrive **long after they were emitted**, including a few that
  predate the roster snapshot
- A handful of agents have **skewed device clocks**, so `emittedAt` is not a
  safe ordering key — `sequence` is monotonic per agent
- `fetchAgents()` and `fetchCalls()` **fail intermittently**, by design

## Time-box

4–5 hours of work, returned within 24 hours. We assess only what fits in that
window. An incomplete submission with clean architecture beats a complete one
that is tangled — tell us in your README what you left out and why.
