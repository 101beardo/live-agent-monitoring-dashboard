import type { CombinedStatus } from "../lib/types";

const LABEL: Record<CombinedStatus["kind"], string> = {
  "on-call": "On call",
  "wrapping-up": "Wrapping up",
  available: "Available",
  "on-break": "On break",
  "logged-out": "Logged out",
  unreachable: "Unreachable",
  stale: "Stale",
};

const CLASS: Record<CombinedStatus["kind"], string> = {
  "on-call": "pill pill-blue",
  "wrapping-up": "pill pill-amber",
  available: "pill pill-green",
  "on-break": "pill pill-slate",
  "logged-out": "pill pill-slate",
  unreachable: "pill pill-red",
  stale: "pill pill-red pill-dashed",
};

export function StatusPill({ status }: { status: CombinedStatus }) {
  const label =
    status.kind === "on-call"
      ? `On call · ${status.sub === "on-hold" ? "hold" : status.sub}`
      : LABEL[status.kind];
  return <span className={CLASS[status.kind]}>{label}</span>;
}
