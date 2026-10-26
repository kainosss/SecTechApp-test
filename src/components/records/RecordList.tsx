import Link from "next/link";
import type { VerificationStatus } from "@/lib/content/schema";
import { Icon } from "@/components/ui/Icon";
import { VerificationBadge } from "@/components/ui/VerificationBadge";

export interface RecordListItem {
  id: string;
  href: string;
  title: string;
  meta: string;
  status: VerificationStatus;
}

/** Published wiring configurations or workflows, with an honest empty state. */
export function RecordList({ title, items, empty }: { title: string; items: RecordListItem[]; empty: string }) {
  return (
    <section aria-label={title} className="mb-6 rounded-2xl border border-line bg-ink-900">
      <h2 className="flex h-12 items-center border-b border-line px-4 text-sm font-semibold text-fg">{title}</h2>
      {items.length === 0 ? (
        <p className="px-4 py-5 text-sm leading-relaxed text-fg-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((r) => (
            <li key={r.id}>
              <Link href={r.href} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-ink-850 active:bg-ink-800">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-fg">{r.title}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-2">
                    <VerificationBadge status={r.status} />
                    <span className="text-xs text-fg-muted">{r.meta}</span>
                  </span>
                </span>
                <Icon name="chevron-right" className="size-4 shrink-0 text-fg-subtle" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
