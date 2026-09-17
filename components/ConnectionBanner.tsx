import type { ConnectionStatus } from "../lib/types";

const COPY: Record<ConnectionStatus, { label: string; tone: string } | null> = {
  open: null, // healthy — show nothing, don't make the supervisor look at chrome
  connecting: { label: "Connecting to live feed…", tone: "banner-info" },
  closed: { label: "Live feed disconnected — reconnecting automatically…", tone: "banner-warn" },
};

/**
 * Requirement 6: the user must be able to tell when the stream is down.
 * Says nothing when the connection is healthy — a banner that's always
 * visible stops meaning anything.
 */
export function ConnectionBanner({ status }: { status: ConnectionStatus }) {
  const copy = COPY[status];
  if (!copy) return null;
  return (
    <div className={`banner ${copy.tone}`} role="status" aria-live="polite">
      {copy.label}
    </div>
  );
}
