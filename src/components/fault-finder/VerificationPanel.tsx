import { VERIFICATION_LABELS, type Workflow } from "@/lib/fault-finder/schema";
import { Icon } from "@/components/ui/Icon";

const TONE = {
  generic: "border-unverified/40 bg-unverified/[0.06] text-unverified",
  "requires-verification": "border-unverified/40 bg-unverified/[0.06] text-unverified",
  "manufacturer-referenced": "border-signal-400/40 bg-signal-500/10 text-signal-300",
  "technician-reviewed": "border-verified/40 bg-verified/10 text-verified",
} as const;

/** A guide's verification status, sources and outstanding checks. */
export function VerificationPanel({ wf }: { wf: Workflow }) {
  const v = wf.verification;
  return (
    <section aria-label="Verification" className={`rounded-xl border px-4 py-3 text-sm ${TONE[v.status]}`} data-testid="verification" data-status={v.status}>
      <p className="flex items-center gap-2 font-semibold">
        <Icon name="shield" className="size-4" />
        {VERIFICATION_LABELS[v.status]}
      </p>
      <p className="mt-1 text-fg-muted">
        {v.reviewer && v.lastReviewed ? `Reviewed by ${v.reviewer} on ${v.lastReviewed}.` : "Not yet reviewed by an experienced technician."}{" "}
        {wf.sources.length === 0 ? "No manufacturer sources recorded." : ""}
      </p>
      {(v.pending.length > 0 || wf.sources.length > 0) && (
        <details className="mt-2">
          <summary className="flex min-h-11 cursor-pointer items-center text-fg">
            {v.pending.length > 0 ? `${v.pending.length} item${v.pending.length === 1 ? "" : "s"} awaiting verification` : "Sources"}
          </summary>
          {v.pending.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-fg-muted">
              {v.pending.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {wf.sources.length > 0 && (
            <ul className="mt-2 space-y-1 text-fg-muted">
              {wf.sources.map((s) => (
                <li key={s.title}>
                  {s.organisation} — {s.title}
                  {s.version ? `, ${s.version}` : ""}
                  {s.date ? ` (${s.date})` : ""}
                  {s.section ? `, ${s.section}` : ""}
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
    </section>
  );
}
