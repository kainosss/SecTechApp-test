import { describe, expect, it } from "vitest";
import type { Source } from "@/lib/content/schema";
import { resolveStatus, weakestStatus, type EvidenceContext } from "@/lib/content/verification";

const sources: Record<string, Source> = {
  manual: { id: "manual", title: "Manual", publisher: "Co", documentType: "installation-manual", documentRevision: "Rev 2", isDemo: false },
  undated: { id: "undated", title: "Undated", publisher: "Co", documentType: "datasheet", isDemo: false },
  demo: { id: "demo", title: "Demo", publisher: "Demo", documentType: "datasheet", documentRevision: "1", isDemo: true },
};

const ctx = (over: Partial<EvidenceContext> = {}): EvidenceContext => ({
  recordStatus: "needs-verification",
  isDemo: false,
  getSource: (id) => sources[id],
  today: "2026-10-26",
  ...over,
});

const good = {
  status: "verified" as const,
  sourceRefs: [{ sourceId: "manual" }],
  appliesToRevisions: ["Rev B"],
  review: { reviewedBy: "Reviewer", reviewedAt: "2026-10-01" },
};

describe("resolveStatus", () => {
  it("honours verified only with complete evidence", () => {
    expect(resolveStatus(good, ctx())).toEqual({ status: "verified", reasons: [] });
  });

  it("downgrades every kind of missing or invalid evidence to needs-verification", () => {
    const cases = [
      { ...good, review: undefined },
      { ...good, review: { reviewedBy: "  ", reviewedAt: "2026-10-01" } },
      { ...good, review: { reviewedBy: "R", reviewedAt: "2026-10-27" } },
      { ...good, review: { reviewedBy: "R", reviewedAt: "26/10/2026" } },
      { ...good, sourceRefs: [] },
      { ...good, sourceRefs: [{ sourceId: "missing" }] },
      { ...good, sourceRefs: [{ sourceId: "undated" }] },
      { ...good, appliesToRevisions: [] },
    ];
    for (const claim of cases) {
      const result = resolveStatus(claim, ctx());
      expect(result.status).toBe("needs-verification");
      expect(result.reasons.length).toBeGreaterThan(0);
    }
  });

  it("never raises a status", () => {
    expect(resolveStatus({ ...good, status: "needs-verification" }, ctx()).status).toBe("needs-verification");
  });

  it("inherits the record status and review when the claim has none", () => {
    const { status: _s, review: _r, ...claim } = good;
    expect(resolveStatus(claim, ctx({ recordStatus: "verified", recordReview: good.review })).status).toBe("verified");
    expect(resolveStatus(claim, ctx({ recordStatus: "verified" })).status).toBe("needs-verification");
  });

  it("forces demonstration for demo records or demo sources, even when declared verified", () => {
    expect(resolveStatus(good, ctx({ isDemo: true })).status).toBe("demonstration");
    expect(resolveStatus({ ...good, sourceRefs: [{ sourceId: "manual" }, { sourceId: "demo" }] }, ctx()).status).toBe("demonstration");
  });
});

describe("weakestStatus", () => {
  it("picks the weakest status and treats an empty set as unverified", () => {
    expect(weakestStatus(["verified", "needs-verification"])).toBe("needs-verification");
    expect(weakestStatus(["verified", "demonstration"])).toBe("demonstration");
    expect(weakestStatus(["verified"])).toBe("verified");
    expect(weakestStatus([])).toBe("needs-verification");
  });
});
