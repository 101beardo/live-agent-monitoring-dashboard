# Live Agent Monitoring Dashboard

A submission for the Senior Frontend Engineer take-home. Time spent: ~5 hours.

## Running it

```bash
npm install
npm run dev      # http://localhost:3000
```

```bash
npm run typecheck   # tsc --noEmit
npm test             # vitest, 12 tests on the reconciliation logic
npm run build        # production build
```

No environment variables, no backend, no config beyond that.

---

## Architecture, and why

**Three layers that don't reach into each other:**

- **`lib/mockAdapter.ts`** — the only file that imports `mock/agentStream.js`. It gives `connect`/`fetchAgents`/`fetchCalls` real TypeScript signatures, so the untyped stream boundary is contained to one file. Swapping in a real WebSocket + REST backend later means rewriting this file only.
- **`lib/reconcile.ts`** — pure functions, no React. `(state, event) -> state` and a separate `deriveCombinedStatus(agent, now) -> CombinedStatus`. This is the piece the brief weighs most heavily, so it's unit-tested (12 cases) independent of anything else in the app.
- **Hooks and components** — `useAgentStream` owns the roster fetch and the live connection and is the only thing that dispatches into the reducer. Everything downstream reads already-reconciled `AgentState`, never a raw event.

**URL is the source of truth for filters, sort, and the selected agent** (`hooks/useFilters.ts`, `?agent=` in `app/Dashboard.tsx`), not component state. "Filters survive a refresh" is a state-architecture decision, not a `localStorage` patch, and it means a supervisor can send a colleague a link straight to a filtered view or one agent's panel — a nice-to-have that falls out for free once the state lives in the right place.

### Correctness under disorder

`sequence` (monotonic per agent) is the *only* ordering key the reducer trusts. `emittedAt` is explicitly called out in the brief as unreliable for ~18 skewed-clock agents, so nothing in `applyEvent` ever branches on it. One comparison — `event.sequence <= current.lastSequence` — uniformly discards duplicates, reconnect replays, and stale pre-snapshot events, because a duplicate has a sequence we've already applied, a stale pre-snapshot event has a sequence at or below the `snapshotSeq` that seeded `lastSequence`, and a reconnect replay is just a duplicate by another name. One consequence worth being explicit about: if events arrive out of order and the reducer sees the *later* one first, it correctly keeps it and rejects the earlier one when it eventually shows up — it never tries to reconstruct what an intermediate state "should" have looked like, only ever displays the latest known-true state.

**On the clock-skew agents specifically:** I didn't write code to detect or special-case them, and I think that's the right answer, not a shortcut. Because ordering never touches `emittedAt`, the 18 skewed-clock agents are handled by the exact same code path as everyone else. Detecting them would only matter if the reducer needed `emittedAt` for something — it doesn't.

### Render cost

Two decisions carry the "don't cost a full re-render every second" requirement:

1. **Batched dispatch, not per-event dispatch.** `useAgentStream` pushes incoming events into a `ref` and flushes the batch into the reducer once per animation frame, instead of dispatching on every `onEvent` callback. At 25 events/sec this already avoids 25 renders/sec of a 300-row grid; the brief states production peaks near 8,000 events/sec, where dispatching per event would be unworkable regardless of memoization downstream. Render rate is capped at the display refresh rate no matter how fast the stream gets.
2. **Row-level memoization that actually bails.** `AgentRow` is `React.memo`'d on reference equality of its `agent` prop. This only works because the reducer produces a *new* object only for the specific agent an event touched — every other agent's reference in the `Map` is untouched — so a typical event re-renders 1 row out of 300, not all 300.
3. **`LiveDuration` is the one component that ticks every second**, and the tick is local `useState` inside a single `<span>`. Nothing above it — not the row, not the grid — knows it's ticking. A call timer costs one DOM text-node update, never a grid re-render.

The two `useNow` cadences (`hooks/useNow.ts`) are deliberately not one shared context: a single 1s-ticking context would force all 300 rows to re-render together every second regardless of whether they needed to. Instead, each row polls staleness independently every 15s (naturally out of phase with each other, so the work spreads rather than bursts), and `LiveDuration` polls at 1s but only for itself.

### Types

`RawStreamEvent` gives the wire format a real shape at the boundary — no `any` reaches `applyEvent`. `CombinedStatus` is a closed discriminated union (`{ kind: "on-call"; sub: ... } | { kind: "available" } | ...`), not a string label, so every branch a supervisor cares about is a value the compiler can check, not a string that can silently drift.

### Component design

`AgentDetailPanel` takes an `AgentState` and a couple of callbacks — it has no idea it's rendered from a grid, or that the grid exists. `AgentRow` takes an `agent` and an `onSelect`; it doesn't know what "select" does. Neither is welded to the other.

---

## A real bug this caught, worth reading

The mock's `emittedAt` and `snapshotTakenAt` are stamped on the generator's own **fixed simulated calendar day** (September 9), completely decoupled from whatever the real wall-clock date is when the app actually runs. I didn't catch this from reading the brief — I caught it by running the app and seeing every agent marked **Stale** on load, and in-progress calls showing **11,000+ minute** durations.

Two fixes, both anchored on real time instead of the simulated timeline:

- Staleness baselines `lastDeviceEventAt` at the real moment the roster was fetched, not at `snapshotTakenAt`.
- An agent already mid-call at snapshot time has `callStartedAt` shifted by the one fixed offset between the snapshot's simulated "now" and real "now" — this preserves how far into the call they actually were, rather than just resetting every in-progress timer to zero. Live `Ringing` events anchor on `receivedAt` (real `Date.now()` at delivery), which needs no such translation.

See the commit history (`fix: anchor real-time durations...`) for the full reasoning — I kept it as its own commit rather than folding it into the original feature, since it's a real "I ran this and it was wrong" moment, not a typo.

A second, related tuning bug: my first stale threshold (90s) flagged a large share of ordinary in-progress calls, because the generator can legitimately leave up to 400s between a device event and `CallEnded` on one normal call. Raised to 8 minutes, with the reasoning in `lib/reconcile.ts`.

---

## What I left out, and why

- **Virtualized rendering.** At 300 rows a plain `<table>` is fine — I profiled nothing that suggested otherwise. I'd reach for `react-window` before the roster gets anywhere near the stated 2,000-agent production target; I've built that exact pattern before (row-windowing over a live-updating list) and know where the seams are, but adding it here without a slow table to point at felt like solving a problem I didn't have yet, at the cost of time I did have a use for elsewhere.
- **Keyboard/accessibility beyond the basics.** Rows are focusable, have `role="button"`, and respond to Enter/Space; the connection banner is `aria-live`. I did not do a full pass (focus trapping in the detail panel, arrow-key grid navigation).
- **Tests beyond the reducer.** 12 tests cover ordering and status derivation, which is where correctness actually lives. I did not add component/integration tests given the time-box; if I had another hour I'd add one for the batched-dispatch behavior in `useAgentStream`.
- **A visible skew/silent-device indicator distinct from "Stale."** Both currently collapse into the same `stale` status. A real dashboard would probably want to tell "this agent's device clock is skewed" apart from "this agent's device has gone silent" — I chose not to build a UI distinction for a signal the reducer doesn't structurally need to detect (see above).

## What I'd change about the data contract

Asked for directly in the brief, so being specific rather than diplomatic:

1. **`fetchCalls` needs a total count.** Offset/limit pagination with no count means "Next" can only be inferred from a short page, and I can never render "page 3 of 7" or jump to the last page. This is a one-field fix on the response.
2. **`emittedAt` and `receivedAt` need documented, guaranteed semantics**, not just a field name each. Right now nothing in the contract says `emittedAt` is safe to compare against wall-clock time — in this dataset it explicitly isn't, and that cost real debugging time. I'd want either a single unambiguous wall-clock field, or an explicit doc comment on the wire format saying which field is which and what it's safe to do with them.
3. **A heartbeat, not silence, for staleness.** I'm inferring "this device might be dead" from the *absence* of events for N minutes, tuned against the longest gap I could find in one dataset's call-shape. That's fragile — a different queue mix or a longer average call changes the safe threshold. A periodic heartbeat/keepalive per agent (even a lightweight "still here" ping every 30s) would make staleness a fact instead of a guess.
4. **`sequence` deserves a doc comment in the contract itself**, not just this brief. It's the single most load-bearing field in the whole reducer; a future engineer reading only the API docs (not this take-home) should be told outright that it's the only safe ordering key.
