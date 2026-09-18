import { Suspense } from "react";
import { Dashboard } from "./Dashboard";
import { LoadingState } from "../components/LoadingState";

// Filters/selection live in the URL (useSearchParams), which Next requires a
// Suspense boundary for during the build's static shell.
export default function Page() {
  return (
    <Suspense fallback={<LoadingState message="Loading…" />}>
      <Dashboard />
    </Suspense>
  );
}
