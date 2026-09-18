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
2. **Row-level memoization that actually bails.** `AgentRow` is `React.memo`'d on reference equality of its `agent` prop. This only works because the reducer produces a *new* object only for the specific agent an event touched — every other agent's reference in the `Map` is untouched — so a typical event re-renders 1 row out of 300, not all 300. **This bail-out was silently unreachable for most of this project's history** — see "A real bug this caught" below for how a `react-window` render-prop identity bug forced full remounts instead, bypassing memo entirely, and how it was found and fixed.
3. **`LiveDuration` is the one component that ticks every second**, and the tick is local `useState` inside a single `<span>`. Nothing above it — not the row, not the grid — knows it's ticking. A call timer costs one DOM text-node update, never a grid re-render.
4. **The grid is virtualized** (`react-window`'s `FixedSizeList`). Only the rows that fit the viewport (~14, plus overscan) are ever mounted — confirmed by counting `.grid-row` elements in the live DOM through scrolling and filtering, not assumed from react-window's docs. At 300 rows this isn't load-bearing; it's built for the brief's stated 2,000-agent production target. The real cost: `react-window` positions rows via an absolutely-positioned `style` prop, which only works on a plain `div`, not a `<tr>` — so the grid gave up native `<table>` markup for `role="table"/"row"/"gridcell"` instead. Header and rows share one `grid-template-columns` definition so they can't drift out of alignment.

The two `useNow` cadences (`hooks/useNow.ts`) are deliberately not one shared context: a single 1s-ticking context would force all 300 rows to re-render together every second regardless of whether they needed to. Instead, each row polls staleness independently every 15s (naturally out of phase with each other, so the work spreads rather than bursts), and `LiveDuration` polls at 1s but only for itself.

### Types

`RawStreamEvent` gives the wire format a real shape at the boundary — no `any` reaches `applyEvent`. `CombinedStatus` is a closed discriminated union (`{ kind: "on-call"; sub: ... } | { kind: "available" } | ...`), not a string label, so every branch a supervisor cares about is a value the compiler can check, not a string that can silently drift.

### Component design

`AgentDetailPanel` takes an `AgentState` and a couple of callbacks — it has no idea it's rendered from a grid, or that the grid exists. `AgentRow` takes an `agent` and an `onSelect`; it doesn't know what "select" does. Neither is welded to the other.

`LoadingState`/`ErrorState`/`EmptyState` are three one-line presentational components extracted after noticing the same shape (a centered message, `ErrorState` additionally pairing it with a `Retry` button) repeated across 7 call sites in 4 files — the roster load, the call-history load, and the filtered-to-empty grid all hit the same three states. Deliberately not extracted further than this: the detail panel's Prev/Next pager has exactly one call site, so it stays inline rather than becoming a component for reuse that doesn't exist yet.

### Styling

Tailwind v4, CSS-first config (`app/globals.css`'s `@theme` block, no `tailwind.config.js`). The `@theme` block is the one place the dark palette's colors are defined (`--color-panel`, `--color-status-red`, etc.) — every component reads them as real utilities (`bg-panel`, `text-status-red`, even `bg-status-green/15` for the translucent pill backgrounds) instead of hex values scattered across files.

One deliberate departure from "just write utility classes everywhere": five patterns that are genuinely reused across multiple files with several variants — `.pill` (6 color variants), `.btn-ghost` (5 call sites), `.banner`, the shared `.grid-row`/`.grid-head` grid template, and a few state-message classes — are extracted into `@layer components` with `@apply`, which is Tailwind's own documented pattern for exactly this case. Everything used at a single call site stays as inline utilities in its component. This isn't hedging on the tool; it's the same "don't repeat a five-property combination six times" judgment I'd apply in plain CSS, just expressed through Tailwind's extraction mechanism instead of a hand-written class.

---

## Three real bugs this caught, worth reading

### The clock-domain bug

The mock's `emittedAt` and `snapshotTakenAt` are stamped on the generator's own **fixed simulated calendar day** (September 9), completely decoupled from whatever the real wall-clock date is when the app actually runs. I didn't catch this from reading the brief — I caught it by running the app and seeing every agent marked **Stale** on load, and in-progress calls showing **11,000+ minute** durations.

Two fixes, both anchored on real time instead of the simulated timeline:

- Staleness baselines `lastDeviceEventAt` at the real moment the roster was fetched, not at `snapshotTakenAt`.
- An agent already mid-call at snapshot time has `callStartedAt` shifted by the one fixed offset between the snapshot's simulated "now" and real "now" — this preserves how far into the call they actually were, rather than just resetting every in-progress timer to zero. Live `Ringing` events anchor on `receivedAt` (real `Date.now()` at delivery), which needs no such translation.

See the commit history (`fix: anchor real-time durations...`) for the full reasoning — I kept it as its own commit rather than folding it into the original feature, since it's a real "I ran this and it was wrong" moment, not a typo.

A second, related tuning bug: my first stale threshold (90s) flagged a large share of ordinary in-progress calls, because the generator can legitimately leave up to 400s between a device event and `CallEnded` on one normal call. Raised to 8 minutes, with the reasoning in `lib/reconcile.ts`.

### The virtualization remount bug — the more serious one

`AgentGrid.tsx`'s row renderer for `react-window`'s `<FixedSizeList>` was originally defined *inside* `AgentGrid`'s own render body. `react-window` uses that function as the rendered element's **type**, not just a callback — so a fresh function identity every render meant React fully unmounted and remounted every visible row on nearly every event batch, silently bypassing `AgentRow`'s `React.memo` the entire time. Confirmed with a temporary mount/unmount log: **1,343 mount/unmount cycles in 4 seconds** for the same ~22 row instances, before the fix; **44 total, all from one one-time transition, then zero** for 9+ seconds of continuous streaming after it. Fixed by moving the row renderer to module scope and passing per-render data through `react-window`'s `itemData` prop instead of a closure. Full writeup, including why the earlier "it's just the Next.js 14→16 toolchain change" theory was an incomplete diagnosis, is in the Performance section below — this bug, not the bundler, was the real reason every performance number up to that point was inflated.

### The detail panel's pagination state didn't reset across agents

`AgentDetailPanel` keeps its current page in local `useState`, and `Dashboard.tsx` originally rendered it with no `key`. Clicking a different agent's row *without closing the panel first* re-renders the same component instance with a new `agent` prop — React has no reason to reset local state for a prop change alone. Page number silently carried over from the previous agent. Traced the actual failure mode: the empty-state message (`data.calls.length === 0 && page === 0`) explicitly excludes non-zero pages, so landing on a stale page 2 for an agent with fewer calls doesn't show an error or an empty message — it shows nothing at all, a blank gap with no explanation.

I found this while checking whether pagination was even reachable in the first place: across all 1,593 call records in `mock/calls.json`, **the busiest agent has 9 calls**, one below `PAGE_SIZE`'s 10 — so "Next" is unconditionally disabled for every agent in this dataset as shipped, and the bug above was latent, not reachable through the UI. Confirmed it's real anyway by temporarily lowering `PAGE_SIZE` to 5 (enough to make pages 2 reachable for several agents), reproducing the exact scenario (an agent with a full page 2, switched directly to one with only 3 calls total), and confirming the blank gap. Fixed with `key={selectedAgent.agentId}` on `<AgentDetailPanel>` in `Dashboard.tsx` — the idiomatic React fix for "a different logical entity should get a fresh component instance," which resets all local state, not just `page`. Re-tested the same switch after the fix: correctly lands on the new agent's page 1. `PAGE_SIZE` is back at 10, its real value — I didn't leave it lowered just to make the demo reachable.

---

## Performance: measured, not asserted

The batched-dispatch claim above is a real measurement, not just reasoning, and getting a trustworthy number took a couple of wrong turns worth being honest about.

**Method:** `<Profiler>` (`components/PerfHud.tsx`) wraps the grid and reports commits/sec and average commit duration over a rolling window, shown behind `?perf=1`. `?dispatch=naive` reverts to per-event dispatch for comparison; `?rate=` overrides the mock's `eventsPerSecond`.

**First wrong turn:** measuring against `next dev`. React Strict Mode double-invokes renders in development, which inflated and distorted both numbers in a way that didn't reflect anything real. Switched to a production build.

**Second wrong turn:** a stock `next build` showed **0 commits/sec** even though the grid was visibly updating — standard production React strips `<Profiler>` instrumentation entirely; `onRender` never fires. Needed `next build --profile`, which keeps profiling hooks in an otherwise-production bundle. Worth knowing on its own: if you ever go looking for render numbers in a normal production build and get suspicious zeros, this is why.

**Third wrong turn, found later:** the HUD's rolling window was 1 second, and the mock's per-event jitter (up to 400ms) plus batched dispatch means events land unevenly across animation frames — a 1s window swung between 1 and 79 commits/s for the *identical* config, back to back. That's sampling noise, not signal. Widened the window to 3s (`components/PerfHud.tsx`), which is what the numbers below actually use.

**Fourth wrong turn, and the one that actually mattered:** partway through, the numbers shifted substantially after an unrelated dependency upgrade (Next.js 14→16, Webpack→Turbopack). My first hypothesis was that the new bundler itself was the cause, and I isolated the styling migration that landed in the same window (`git stash`, rebuild with Next 16 but the old plain CSS, re-measure, restore) to rule out CSS as a contributing factor — it wasn't; the numbers came back statistically identical either way, which made sense since Tailwind never touches React's render behavior.

But "blame the bundler" turned out to be an incomplete diagnosis, not the real answer. Digging further (prompted by the numbers looking higher than the architecture should allow, not by a specific complaint) turned up a genuine bug in `AgentGrid.tsx` that had been there since virtualization was first added, unrelated to any toolchain: the `Row` function passed to `react-window`'s `<FixedSizeList>` was defined *inside* `AgentGrid`'s render body, so it was a fresh function on every render. `react-window` renders each row via `createElement(children, itemProps)` — it uses that function as the element's **type**, not just as a callback. A changing type forces React to unmount and remount at that position, every time, regardless of `key`. That completely bypasses `React.memo` on `AgentRow`, since memo only helps when reconciling an *existing* instance against new props — it does nothing for a fresh mount.

Confirmed empirically, not just from reading react-window's source: I added a temporary mount/unmount log to `AgentRow` and watched the console during live streaming. **1,343 mount/unmount log lines in 4 seconds**, for the same ~22 visible+overscanned row instances, cycling continuously. Every row was being destroyed and rebuilt on nearly every event batch. Fixed by moving `Row` to module scope (a stable reference across renders) and passing `agents`/`onSelect` through `react-window`'s `itemData` prop instead of closure capture — `itemData` is a normal prop, safe to change every render, since it doesn't affect the element's type. Re-ran the same diagnostic after the fix: 44 log lines total, all from one single one-time transition, then zero for the rest of a 9-second observation window under continuous streaming.

This means every performance number in earlier drafts of this README — under both Next 14/Webpack and Next 16/Turbopack — was measured against a grid that was silently remounting itself instead of updating in place. The toolchain change didn't cause the expensive numbers; it just changed how expensive the *already-broken* remounting was. The numbers below are the first ones measured against the actually-correct implementation.

**Results** (Next 16, production + `--profile`, Turbopack, post-fix, same machine, same dataset, each cell averaged over three 3-second windows, excluding the first reading after any navigation to avoid startup transients):

| Mode | Rate | Commits/sec | Avg commit | Total render time/sec |
|---|---|---|---|---|
| Batched (default) | 25/s (dataset default) | ~89-95 | ~0.08-0.09ms | ~7-9ms |
| Naive (per-event) | 25/s | ~132-136 | ~0.07-0.08ms | ~9-11ms |
| Batched | 500/s (20x load) | ~92-96 | ~0.08-0.10ms | ~7-10ms |
| Naive | 500/s | ~118-149 | ~0.06-0.08ms | ~7-12ms |

What this actually shows, reported plainly rather than rounded into a cleaner story:

- **Average commit duration dropped roughly 8x across both dispatch modes** the moment the remount bug was fixed (batched: ~0.68ms → ~0.08ms; naive: ~0.59ms → ~0.07ms). That's the real signature of `React.memo` finally being reachable: a commit that updates 1-2 changed rows and bails out on ~20 unchanged ones is genuinely cheap, which it was never able to be while every commit was secretly a mass unmount/remount.
- **Batched staying flat under a 20x load increase still holds, and holds more cleanly than before** — commits/sec barely moves between 25/s and 500/s for either mode. That's the direct proof of the architecture claim: render work is decoupled from event-arrival rate.
- **The batched-vs-naive gap is now small — roughly 1.1-1.3x, and partly within the noise of these particular runs** (naive @ 500/s ranged 118-149 across samples). Both dispatch modes now share the same cheap per-commit cost, since both go through the same now-correctly-memoized row pipeline; the remaining difference is closer to the more modest cost `useAgentStream`'s naive branch pays for dispatching once per event instead of once per animation frame, not the dramatic multiplier the buggy numbers implied. The architectural argument for batching still stands on its own terms — it's the only one of the two designs that doesn't dispatch at the stream's raw rate, which is what actually matters at the brief's stated 8,000 events/sec production target, well beyond what this 500/s mock can exercise.
- If I had another hour, I'd reach for Chrome DevTools' Performance panel for the row-level mount/unmount visibility this bug needed to actually catch, rather than a temporary `console.log` in the row component — the Profiler API alone never surfaced this; a mount/unmount count would have.

## What I left out, and why

- **Keyboard/accessibility beyond the basics.** Rows are focusable, have `role="button"`, and respond to Enter/Space; the connection banner is `aria-live`. I did not do a full pass (focus trapping in the detail panel, arrow-key grid navigation).
- **Component/integration tests.** 26 tests cover the reducer and selectors, which is where correctness actually lives. I did not add React Testing Library tests for the hooks/components themselves given the time-box; if I had another hour I'd add one exercising `useAgentStream`'s batched-vs-naive dispatch behavior directly, rather than only observing it through the Profiler.
- **A visible skew/silent-device indicator distinct from "Stale."** Both currently collapse into the same `stale` status. A real dashboard would probably want to tell "this agent's device clock is skewed" apart from "this agent's device has gone silent" — I chose not to build a UI distinction for a signal the reducer doesn't structurally need to detect (see above).
- **Responsive/mobile layout.** No breakpoints anywhere — at a phone-width viewport the grid's fixed-pixel columns push the Agent name column off-screen with no way to scroll to it. Deliberate, not an oversight: this is a supervisor monitoring tool meant to be watched from a desk for a full shift, not something anyone is meant to check from a phone, and nothing in the brief's requirements or bonus points asks for it. Fixing it properly would mean reworking the grid's fixed-pixel column widths and virtualized row-height math, not adding a quick media query.

## What I'd change about the data contract

Asked for directly in the brief, so being specific rather than diplomatic:

1. **`fetchCalls` needs a total count.** Offset/limit pagination with no count means "Next" can only be inferred from a short page, and I can never render "page 3 of 7" or jump to the last page. This is a one-field fix on the response.
2. **`emittedAt` and `receivedAt` need documented, guaranteed semantics**, not just a field name each. Right now nothing in the contract says `emittedAt` is safe to compare against wall-clock time — in this dataset it explicitly isn't, and that cost real debugging time. I'd want either a single unambiguous wall-clock field, or an explicit doc comment on the wire format saying which field is which and what it's safe to do with them.
3. **A heartbeat, not silence, for staleness.** I'm inferring "this device might be dead" from the *absence* of events for N minutes, tuned against the longest gap I could find in one dataset's call-shape. That's fragile — a different queue mix or a longer average call changes the safe threshold. A periodic heartbeat/keepalive per agent (even a lightweight "still here" ping every 30s) would make staleness a fact instead of a guess.
4. **`sequence` deserves a doc comment in the contract itself**, not just this brief. It's the single most load-bearing field in the whole reducer; a future engineer reading only the API docs (not this take-home) should be told outright that it's the only safe ordering key.
