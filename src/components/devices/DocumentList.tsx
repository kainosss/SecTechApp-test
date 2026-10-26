import type { CitedSource } from "@/lib/content/repository";
import { Icon } from "@/components/ui/Icon";

export const DOC_TYPE_LABELS: Record<CitedSource["documentType"], string> = {
  "product-page": "Product page",
  datasheet: "Datasheet",
  "installation-manual": "Installation manual",
  "programming-manual": "Programming manual",
  "wiring-guide": "Wiring guide",
  "technical-bulletin": "Technical bulletin",
  standard: "Standard",
  other: "Document",
};

/** Manufacturer documents with revision metadata and a large tap target to open each one. */
export function DocumentList({ documents, empty }: { documents: CitedSource[]; empty: string }) {
  if (documents.length === 0) return <p className="px-4 py-4 text-sm leading-relaxed text-fg-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {documents.map((doc) => (
        <li key={`${doc.id}:${doc.locator ?? ""}`} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
          <span className="min-w-0 flex-1">
            <span className="block font-mono text-[11px] tracking-wider text-fg-subtle uppercase">
              {DOC_TYPE_LABELS[doc.documentType]}
              {doc.documentNumber && ` · ${doc.documentNumber}`}
              {doc.documentRevision && ` · ${doc.documentRevision}`}
            </span>
            <span className="mt-0.5 block text-[15px] text-fg">{doc.title}</span>
            <span className="block text-xs text-fg-muted">
              {doc.publisher}
              {doc.locator && ` · ${doc.locator}`}
              {doc.publishedDate && ` · Published ${doc.publishedDate}`}
              {doc.accessedDate && ` · Link checked ${doc.accessedDate}`}
            </span>
          </span>
          {doc.url ? (
            <a
              href={doc.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-medium text-fg hover:bg-ink-850"
            >
              Open
              <span className="sr-only"> {doc.title}</span>
              <Icon name="external" className="size-4" />
            </a>
          ) : (
            <span className="shrink-0 text-xs text-fg-subtle">{doc.isDemo ? "Demonstration document — no file" : "No public link"}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
