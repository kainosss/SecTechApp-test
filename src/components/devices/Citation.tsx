import type { CitedSource } from "@/lib/content/repository";

function label(s: CitedSource) {
  return [s.title, s.documentRevision, s.locator].filter(Boolean).join(", ");
}

/** Inline "Source: …" line. Missing citations are shown, not hidden. */
export function Citation({ sources, className = "" }: { sources: CitedSource[]; className?: string }) {
  return (
    <span className={`block text-xs text-fg-subtle ${className}`}>
      Source: {sources.length === 0 ? <span className="text-unverified">none cited</span> : sources.map(label).join("; ")}
    </span>
  );
}

/** If every item cites exactly the same sources, returns them so a section can cite once. */
export function sharedSources(items: { sources: CitedSource[] }[]): CitedSource[] | null {
  const key = (sources: CitedSource[]) => JSON.stringify(sources.map((s) => [s.id, s.locator ?? ""]));
  const first = items[0];
  if (!first || first.sources.length === 0) return null;
  return items.every((i) => key(i.sources) === key(first.sources)) ? first.sources : null;
}
