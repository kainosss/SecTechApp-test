import type { CitedSource, ResolvedClaim } from "@/lib/content/repository";
import type { VerificationStatus } from "@/lib/content/schema";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import { Citation } from "./Citation";

type AnyClaim = ResolvedClaim<object>;

/** Status to show once for a whole section when every claim in it agrees, else null. */
export function sharedStatus(claims: { status: VerificationStatus }[]): VerificationStatus | null {
  const first = claims[0]?.status;
  return first && claims.every((c) => c.status === first) ? first : null;
}

/**
 * Evidence line under a claim: status (when it differs from the section),
 * citation (unless shared), applicability and reviewer.
 */
export function ClaimMeta({
  claim,
  showStatus,
  showSources,
  locatorOnly = false,
}: {
  claim: AnyClaim;
  showStatus: boolean;
  showSources: boolean;
  /** The section names the document once; show only this claim's page/section. */
  locatorOnly?: boolean;
}) {
  const applies = [
    claim.appliesToVariants.length > 0 && `Variants: ${claim.appliesToVariants.join(", ")}`,
    claim.appliesToRevisions.length > 0 && `Revisions: ${claim.appliesToRevisions.join(", ")}`,
  ].filter(Boolean);
  const hasSource = showSources && (!locatorOnly || Boolean(claim.sources[0]?.locator));
  if (!showStatus && !hasSource && applies.length === 0 && !claim.review) return null;
  return (
    <span className="mt-1.5 flex flex-col gap-1">
      {showStatus && <VerificationBadge status={claim.status} className="self-start" />}
      {showSources &&
        (locatorOnly ? (
          claim.sources[0]?.locator && <span className="block text-xs text-fg-subtle">Source: {claim.sources[0].locator}</span>
        ) : (
          <Citation sources={claim.sources} />
        ))}
      {applies.length > 0 && <span className="block text-xs text-fg-subtle">{applies.join(" · ")}</span>}
      {claim.review && claim.status === "verified" && (
        <span className="block text-xs text-fg-subtle">
          Reviewed by {claim.review.reviewedBy} on {claim.review.reviewedAt}
        </span>
      )}
    </span>
  );
}

/** Footer for a section whose claims all share the same sources and/or status. */
export function SectionEvidence({ sources, status }: { sources: CitedSource[] | null; status: VerificationStatus | null }) {
  if (!sources && !status) return null;
  return (
    <div className="flex flex-col gap-1.5 border-t border-line px-4 py-2.5">
      {status && <VerificationBadge status={status} className="self-start" />}
      {sources && <Citation sources={sources} />}
    </div>
  );
}
