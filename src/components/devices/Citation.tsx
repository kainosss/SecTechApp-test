import { getSource } from "@/lib/content/repository";
import type { SourceRef } from "@/lib/content/schema";

/** Inline "Source: …" line. Missing citations are shown, not hidden. */
export function Citation({ refs, className = "" }: { refs: SourceRef[]; className?: string }) {
  return (
    <span className={`block text-xs text-fg-subtle ${className}`}>
      Source:{" "}
      {refs.length === 0 ? (
        <span className="text-unverified">none cited</span>
      ) : (
        refs.map((r) => [getSource(r.sourceId)?.title ?? r.sourceId, r.locator].filter(Boolean).join(", ")).join("; ")
      )}
    </span>
  );
}

/** If every item cites exactly the same sources, returns them so a section can cite once. */
export function sharedRefs(items: { sourceRefs: SourceRef[] }[]): SourceRef[] | null {
  const key = (refs: SourceRef[]) => JSON.stringify(refs.map((r) => [r.sourceId, r.locator ?? ""]));
  const first = items[0];
  if (!first || first.sourceRefs.length === 0) return null;
  return items.every((i) => key(i.sourceRefs) === key(first.sourceRefs)) ? first.sourceRefs : null;
}
