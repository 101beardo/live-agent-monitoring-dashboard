# Live Agent Monitoring Dashboard

A submission for the Senior Frontend Engineer take-home. Time spent: ~5 hours.

## Running it

```bash
npm install
npm run dev      # http://localhost:3000
```

```bash
npm run typecheck   # tsc --noEmit
npm test             # vitest, 26 tests on reconciliation + selectors
npm run build        # production build
```

No environment variables, no backend, no config beyond that.

**Debug-only URL params** (never surfaced in the UI itself): `?perf=1` shows a live render-cost HUD, `?dispatch=naive` reverts to per-event dispatch to compare against the default batched path, `?rate=500` raises the mock's event rate. These three are how the Performance section below was actually measured, not asserted.

---

## Architecture, and why

**Three layers that don't reach into each other:**

- **`lib/mockAdapter.ts`** — the only file that imports `mock/agentStream.js`. It gives `connect`/`fetchAgents`/`fetchCalls` real TypeScript signatures, so the untyped stream boundary is contained to one file. Swapping in a real WebSocket + REST backend later means rewriting this file only.
- **`lib/reconcile.ts`** — pure functions, no React. `(state, event) -> state` and a separate `deriveCombinedStatus(agent, now) -> CombinedStatus`. This is the piece the brief weighs most heavily, unit-tested (17 cases) independent of anything else in the app.
- **`lib/selectors.ts`** — same pattern applied to filtering/sorting (9 more tests). This used to live inline inside `Dashboard.tsx`'s `useMemo` callbacks; pulling it out means "does filtering by state actually work" is answerable without clicking through the UI.
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
4. **The grid is virtualized** (`react-window`'s `FixedSizeList`). Only the rows that fit the viewport (~14, plus overscan) are ever mounted — confirmed by counting `.grid-row` elements in the live DOM through scrolling and filtering, not assumed from react-window's docs. At 300 rows this isn't load-bearing; it's built for the brief's stated 2,000-agent production target. The real cost: `react-window` positions rows via an absolutely-positioned `style` prop, which only works on a plain `div`, not a `<tr>` — so the grid gave up native `<table>` markup for `role="table"/"row"/"gridcell"` instead. Header and rows share one `grid-template-columns` definition so they can't drift out of alignment.

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

## Performance: measured, not asserted

The batched-dispatch claim above is a real measurement, not just reasoning, and getting a trustworthy number took a couple of wrong turns worth being honest about.

**Method:** `<Profiler>` (`components/PerfHud.tsx`) wraps the grid and reports commits/sec and average commit duration over a rolling window, shown behind `?perf=1`. `?dispatch=naive` reverts to per-event dispatch for comparison; `?rate=` overrides the mock's `eventsPerSecond`.

**First wrong turn:** measuring against `next dev`. React Strict Mode double-invokes renders in development, which inflated and distorted both numbers in a way that didn't reflect anything real. Switched to a production build.

**Second wrong turn:** a stock `next build` showed **0 commits/sec** even though the grid was visibly updating — standard production React strips `<Profiler>` instrumentation entirely; `onRender` never fires. Needed `next build --profile`, which keeps profiling hooks in an otherwise-production bundle. Worth knowing on its own: if you ever go looking for render numbers in a normal production build and get suspicious zeros, this is why.

**Results** (production + `--profile`, same machine, same dataset):

| Mode | Rate | Commits/sec | Avg commit | Total render time/sec |
|---|---|---|---|---|
| Batched (default) | 25/s (dataset default) | ~19–28 | ~0.36–0.46ms | ~8–13ms |
| Naive (per-event) | 25/s | ~138 | ~1.17ms | ~161ms |
| Batched | 500/s (20x load) | ~14 | ~0.29ms | ~4ms |
| Naive | 500/s | ~121 | ~1.59ms | ~192ms |

Two things stand out, and I'd rather report both plainly than round them into a cleaner-sounding story:

- **Batched stayed flat, or even ticked down, when the input rate went up 20x.** That's the actual proof of the architecture claim: render rate is decoupled from event-arrival rate, not just "capped in theory."
- **Commit *count* for naive (~120–140/s) never actually tracked the raw dispatch rate (25 or 500/s) 1:1 in either direction** — it's higher than 25 and lower than 500. Two things are contributing to that I can't fully separate with this tool: React 18's own scheduler coalescing some rapid successive dispatches even without my batching, and the Profiler counting *every* commit touching the grid's subtree, including the isolated per-row/`LiveDuration` ticks that were specifically designed to be cheap (they show up as extra low-cost commits, not zero commits). The cleaner, more honest signal is **total render time per second** (commits × avg duration): naive costs roughly **15–20x more wall-clock rendering time than batched, at the same input rate**, and that ratio held at both 25/s and 500/s. If I had another hour here, I'd reach for Chrome DevTools' Performance panel (long-task tracking) instead of the Profiler API to get a cleaner separation between "a full grid-relevant update happened" and "one isolated timer ticked."

## What I left out, and why

- **Keyboard/accessibility beyond the basics.** Rows are focusable, have `role="button"`, and respond to Enter/Space; the connection banner is `aria-live`. I did not do a full pass (focus trapping in the detail panel, arrow-key grid navigation).
- **Component/integration tests.** 26 tests cover the reducer and selectors, which is where correctness actually lives. I did not add React Testing Library tests for the hooks/components themselves given the time-box; if I had another hour I'd add one exercising `useAgentStream`'s batched-vs-naive dispatch behavior directly, rather than only observing it through the Profiler.
- **A visible skew/silent-device indicator distinct from "Stale."** Both currently collapse into the same `stale` status. A real dashboard would probably want to tell "this agent's device clock is skewed" apart from "this agent's device has gone silent" — I chose not to build a UI distinction for a signal the reducer doesn't structurally need to detect (see above).

## What I'd change about the data contract

Asked for directly in the brief, so being specific rather than diplomatic:

1. **`fetchCalls` needs a total count.** Offset/limit pagination with no count means "Next" can only be inferred from a short page, and I can never render "page 3 of 7" or jump to the last page. This is a one-field fix on the response.
2. **`emittedAt` and `receivedAt` need documented, guaranteed semantics**, not just a field name each. Right now nothing in the contract says `emittedAt` is safe to compare against wall-clock time — in this dataset it explicitly isn't, and that cost real debugging time. I'd want either a single unambiguous wall-clock field, or an explicit doc comment on the wire format saying which field is which and what it's safe to do with them.
3. **A heartbeat, not silence, for staleness.** I'm inferring "this device might be dead" from the *absence* of events for N minutes, tuned against the longest gap I could find in one dataset's call-shape. That's fragile — a different queue mix or a longer average call changes the safe threshold. A periodic heartbeat/keepalive per agent (even a lightweight "still here" ping every 30s) would make staleness a fact instead of a guess.
4. **`sequence` deserves a doc comment in the contract itself**, not just this brief. It's the single most load-bearing field in the whole reducer; a future engineer reading only the API docs (not this take-home) should be told outright that it's the only safe ordering key.
