import { Suspense } from "react";
import { Dashboard } from "./Dashboard";

// Filters/selection live in the URL (useSearchParams), which Next requires a
// Suspense boundary for during the build's static shell.
export default function Page() {
  return (
    <Suspense fallback={<div className="loading-state">Loading…</div>}>
      <Dashboard />
    </Suspense>
  );
}
