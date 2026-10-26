"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { search, type SearchDocument, type SearchResultType } from "@/lib/search/search";
import { Icon } from "@/components/ui/Icon";

const TYPE_LABEL: Record<SearchResultType, string> = { device: "Device", manufacturer: "Brand", tool: "Tool" };

export function UniversalSearch({
  index,
  initialQuery = "",
  autoFocus = false,
  previewLimit = 6,
}: {
  index: SearchDocument[];
  initialQuery?: string;
  autoFocus?: boolean;
  previewLimit?: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const results = useMemo(() => search(index, query, 50), [index, query]);
  const listId = useId();
  const trimmed = query.trim();

  return (
    <div>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed) router.push(`/search?q=${encodeURIComponent(trimmed)}`);
        }}
        className="group relative"
      >
        <label htmlFor={`${listId}-input`} className="sr-only">
          Search devices, model numbers, brands and tools
        </label>
        <Icon
          name="search"
          className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-fg-subtle group-focus-within:text-signal-400"
        />
        <input
          id={`${listId}-input`}
          type="search"
          inputMode="search"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Model number, brand or device type"
          aria-controls={listId}
          className="h-14 w-full rounded-xl border border-line-strong bg-ink-850 pr-4 pl-12 text-base text-fg placeholder:text-fg-subtle shadow-[0_1px_0_0_rgb(255_255_255/0.03)_inset] transition-colors focus:border-signal-500 focus:bg-ink-800 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
      </form>

      {trimmed && (
        <div id={listId} aria-live="polite" className="mt-2 overflow-hidden rounded-xl border border-line bg-ink-900">
          {results.length === 0 ? (
            <p className="px-4 py-4 text-sm text-fg-muted">
              No matches for <span className="font-mono text-fg">“{trimmed}”</span>. Try a model number like{" "}
              <span className="font-mono">KS-PIR12</span>.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {results.slice(0, previewLimit).map((r) => (
                <li key={`${r.type}:${r.id}`}>
                  <Link href={r.href} className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-ink-850 active:bg-ink-800">
                    <span className="w-12 shrink-0 font-mono text-[10px] tracking-wider text-fg-subtle uppercase">
                      {TYPE_LABEL[r.type]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-fg">{r.title}</span>
                      <span className="block truncate text-xs text-fg-muted">{r.subtitle}</span>
                    </span>
                    <Icon name="chevron-right" className="size-4 shrink-0 text-fg-subtle" />
                  </Link>
                </li>
              ))}
              {results.length > previewLimit && (
                <li>
                  <Link
                    href={`/search?q=${encodeURIComponent(trimmed)}`}
                    className="flex h-12 items-center justify-center text-sm font-medium text-signal-400 hover:bg-ink-850"
                  >
                    See all {results.length} results
                  </Link>
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
