"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DeviceListItem, ManufacturerSummary } from "@/lib/content/repository";
import { CATEGORY_GROUPS } from "@/lib/content/schema";
import { filterDevices, filterFromSearchParams, filterToSearchParams, groupCounts, type DeviceFilter } from "@/lib/devices/filter";
import { readLibraryState, writeLibraryState } from "@/lib/storage/library-state";
import { DeviceRow } from "./DeviceRow";
import { Icon } from "@/components/ui/Icon";

export const PAGE_SIZE = 30;

function parseShown(value: string | null | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n > PAGE_SIZE ? n : PAGE_SIZE;
}

/** Reads the initial filter, page size and scroll position from the URL. Use inside <Suspense>. */
export function DeviceBrowserFromUrl(props: { devices: DeviceListItem[]; manufacturers: ManufacturerSummary[] }) {
  const params = useSearchParams();
  const initialFilter = filterFromSearchParams({
    q: params.get("q") ?? undefined,
    group: params.get("group") ?? undefined,
    manufacturer: params.get("manufacturer") ?? undefined,
  });
  return <DeviceBrowser {...props} initialFilter={initialFilter} initialShown={parseShown(params.get("shown"))} restoreScroll />;
}

export function DeviceBrowser({
  devices,
  manufacturers,
  initialFilter,
  initialShown = PAGE_SIZE,
  restoreScroll = false,
}: {
  devices: DeviceListItem[];
  manufacturers: ManufacturerSummary[];
  initialFilter: DeviceFilter;
  initialShown?: number;
  restoreScroll?: boolean;
}) {
  const [filter, setFilterState] = useState<DeviceFilter>(initialFilter);
  const [shown, setShown] = useState(initialShown);
  const chipRow = useRef<HTMLDivElement>(null);

  // Keep the active equipment chip visible in the horizontally scrolling row on phones.
  useEffect(() => {
    // Scroll only the chip row horizontally; scrollIntoView could also move the page and lose the restored position.
    const row = chipRow.current;
    const chip = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (row && chip) row.scrollLeft = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2;
  }, [filter.group]);

  const results = useMemo(() => filterDevices(devices, filter), [devices, filter]);
  const counts = useMemo(() => groupCounts(devices, filter), [devices, filter]);
  const groups = CATEGORY_GROUPS.filter((g) => g.id !== "other" || counts.has("other"));
  const active = Boolean(filter.query?.trim() || filter.group || filter.manufacturerId);

  // Captured before the save effect below can overwrite it.
  const [savedPosition] = useState(() => (restoreScroll && typeof window !== "undefined" ? readLibraryState() : null));

  // Returning to the exact same list: put the technician back where they were.
  useEffect(() => {
    const saved = savedPosition;
    if (saved && saved.url === `${window.location.pathname}${window.location.search}` && saved.scrollY > 0) {
      requestAnimationFrame(() => window.scrollTo(0, saved.scrollY));
    }
  }, [savedPosition]);

  // Keep the URL (shareable, Back-button safe) and the per-tab saved position in sync.
  useEffect(() => {
    const url = `/devices${filterToSearchParams(filter, { shown: shown > PAGE_SIZE ? String(shown) : undefined })}`;
    if (`${window.location.pathname}${window.location.search}` !== url) window.history.replaceState(window.history.state, "", url);

    const save = () => writeLibraryState({ url, scrollY: window.scrollY });
    save();
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(save);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [filter, shown]);

  function setFilter(next: DeviceFilter) {
    setFilterState(next);
    setShown(PAGE_SIZE);
  }

  const chip = (label: string, value: DeviceFilter["group"], count?: number) => {
    const selected = filter.group === value;
    return (
      <button
        key={label}
        type="button"
        aria-pressed={selected}
        onClick={() => setFilter({ ...filter, group: value })}
        className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors ${
          selected
            ? "border-signal-500/60 bg-signal-500/15 text-signal-300"
            : count === 0
              ? "border-line text-fg-subtle"
              : "border-line-strong text-fg-muted hover:text-fg"
        }`}
      >
        {label}
        {count !== undefined && <span className="font-mono text-xs opacity-70">{count}</span>}
      </button>
    );
  };

  const selectedGroup = CATEGORY_GROUPS.find((g) => g.id === filter.group);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="group relative flex-1">
          <label htmlFor="device-query" className="sr-only">
            Search by model, part number, manufacturer or keyword
          </label>
          <Icon
            name="search"
            className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-fg-subtle group-focus-within:text-signal-400"
          />
          <input
            id="device-query"
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={filter.query ?? ""}
            onChange={(e) => setFilter({ ...filter, query: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            placeholder="Model, part number or keyword"
            className="h-12 w-full rounded-xl border border-line-strong bg-ink-850 pr-11 pl-11 text-base text-fg placeholder:text-fg-subtle focus:border-signal-500 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {filter.query && (
            <button
              type="button"
              onClick={() => setFilter({ ...filter, query: "" })}
              aria-label="Clear search"
              className="absolute top-1/2 right-1 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-fg-subtle hover:text-fg"
            >
              <Icon name="close" className="size-4" />
            </button>
          )}
        </div>
        <label className="relative sm:w-60">
          <span className="sr-only">Manufacturer</span>
          <select
            value={filter.manufacturerId ?? ""}
            onChange={(e) => setFilter({ ...filter, manufacturerId: e.target.value || undefined })}
            className="h-12 w-full appearance-none rounded-xl border border-line-strong bg-ink-850 pr-10 pl-3.5 text-base text-fg focus:border-signal-500 focus:outline-none"
          >
            <option value="">All manufacturers</option>
            {manufacturers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <Icon name="chevron-right" className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 rotate-90 text-fg-subtle" />
        </label>
      </div>

      <div ref={chipRow} role="group" aria-label="Equipment type" className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {chip("All", undefined)}
        {groups.map((g) => chip(g.label, g.id, counts.get(g.id) ?? 0))}
      </div>

      <div className="mt-4 mb-2 flex h-8 items-center justify-between text-sm">
        <p aria-live="polite" className="text-fg-muted">
          {results.length} {results.length === 1 ? "device" : "devices"}
        </p>
        {active && (
          <button type="button" onClick={() => setFilter({})} className="h-8 px-1 font-medium text-signal-400 hover:text-signal-300">
            Clear filters
          </button>
        )}
      </div>

      {results.length === 0 ? (
        <div className="rounded-2xl border border-line bg-ink-900 px-4 py-6 text-sm leading-relaxed text-fg-muted">
          {selectedGroup && !filter.query?.trim() && !filter.manufacturerId ? (
            <p>
              No {selectedGroup.label.toLowerCase()} are in the library yet. Records are added once their manufacturer
              documentation has been sourced.
            </p>
          ) : (
            <p>No devices match. Check the model number or part number, or clear the filters to see the full library.</p>
          )}
          {active && (
            <button type="button" onClick={() => setFilter({})} className="mt-3 h-10 font-medium text-signal-400">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-ink-900">
          {results.slice(0, shown).map((d) => (
            <li key={d.id}>
              <DeviceRow device={d} />
            </li>
          ))}
        </ul>
      )}
      {results.length > shown && (
        <button
          type="button"
          onClick={() => setShown(shown + PAGE_SIZE)}
          className="mt-3 h-12 w-full rounded-xl border border-line-strong text-sm font-medium text-fg-muted hover:text-fg"
        >
          Show more ({results.length - shown} remaining)
        </button>
      )}
    </div>
  );
}
