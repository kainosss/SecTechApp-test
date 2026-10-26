/**
 * Effective verification status — the only place that decides whether
 * something may be labelled "Verified".
 *
 * Fail-safe rules: a declared "verified" status is honoured only when ALL of
 * the following hold; otherwise the claim is downgraded to
 * "needs-verification" (or "demonstration" for demo material):
 *
 *   1. A review names the reviewer and a valid, non-future review date.
 *   2. At least one source is cited, and every cited source exists.
 *   3. No cited source is demonstration material.
 *   4. Every cited source records a document revision or publication date.
 *   5. The claim states which device revision(s) it was checked against.
 *
 * A status can only ever be lowered here, never raised.
 */
import type { Review, Source, SourceRef, VerificationStatus } from "./schema";

export interface ClaimEvidence {
  status?: VerificationStatus;
  sourceRefs: SourceRef[];
  appliesToRevisions: string[];
  review?: Review;
}

export interface EvidenceContext {
  /** Declared status and review of the enclosing record, inherited when the claim omits its own. */
  recordStatus: VerificationStatus;
  recordReview?: Review;
  /** True when the enclosing record is demonstration material. */
  isDemo: boolean;
  getSource: (id: string) => Source | undefined;
  /** Injected for tests; defaults to today. */
  today?: string;
}

export interface ResolvedStatus {
  status: VerificationStatus;
  /** Why a declared "verified" was not honoured (empty when it was, or was not claimed). */
  reasons: string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidPastDate(value: string, today: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) && value <= today;
}

export function resolveStatus(claim: ClaimEvidence, ctx: EvidenceContext): ResolvedStatus {
  const sources = claim.sourceRefs.map((r) => ctx.getSource(r.sourceId));

  if (ctx.isDemo || sources.some((s) => s?.isDemo)) return { status: "demonstration", reasons: [] };

  const declared = claim.status ?? ctx.recordStatus;
  if (declared !== "verified") return { status: declared, reasons: [] };

  const today = ctx.today ?? new Date().toISOString().slice(0, 10);
  const review = claim.review ?? ctx.recordReview;
  const reasons: string[] = [];

  if (!review || !review.reviewedBy.trim()) reasons.push("no reviewer recorded");
  else if (!isValidPastDate(review.reviewedAt, today)) reasons.push("review date missing, invalid or in the future");

  if (claim.sourceRefs.length === 0) reasons.push("no source cited");
  claim.sourceRefs.forEach((ref, i) => {
    const source = sources[i];
    if (!source) reasons.push(`cited source "${ref.sourceId}" does not exist`);
    else if (!source.documentRevision && !source.publishedDate) {
      reasons.push(`source "${source.id}" has no document revision or publication date`);
    }
  });

  if (claim.appliesToRevisions.length === 0) reasons.push("applicable device revision not stated");

  return reasons.length === 0 ? { status: "verified", reasons } : { status: "needs-verification", reasons };
}

/** The weakest status in a set: demonstration < needs-verification < verified. */
export function weakestStatus(statuses: VerificationStatus[]): VerificationStatus {
  if (statuses.includes("demonstration")) return "demonstration";
  if (statuses.includes("needs-verification")) return "needs-verification";
  return statuses.length > 0 ? "verified" : "needs-verification";
}
