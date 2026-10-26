import type { Review, VerificationStatus } from "@/lib/content/schema";
import { STATUS_LABELS } from "@/lib/content/schema";
import { VerificationBadge } from "./VerificationBadge";

const TONE: Record<VerificationStatus, string> = {
  verified: "border-verified/30 bg-verified/5",
  "needs-verification": "border-unverified/30 bg-unverified/5",
  demonstration: "border-example/30 bg-example/[0.07]",
};

/** Record-level verification banner shared by device, wiring and workflow pages. */
export function StatusPanel({
  status,
  explanation,
  updatedAt,
  review,
  notes,
}: {
  status: VerificationStatus;
  explanation: string;
  updatedAt?: string;
  review?: Review;
  notes?: string;
}) {
  return (
    <div role="note" aria-label={`Verification status: ${STATUS_LABELS[status]}`} className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${TONE[status]}`}>
      <div className="flex flex-wrap items-center gap-2">
        <VerificationBadge status={status} />
        {updatedAt && <span className="text-xs text-fg-subtle">Updated {updatedAt}</span>}
      </div>
      <p className="mt-2 text-fg">{explanation}</p>
      {review && status === "verified" && (
        <p className="mt-1 text-xs text-fg-muted">
          Reviewed by {review.reviewedBy} on {review.reviewedAt}
        </p>
      )}
      {notes && <p className="mt-1 text-fg-muted">{notes}</p>}
    </div>
  );
}
