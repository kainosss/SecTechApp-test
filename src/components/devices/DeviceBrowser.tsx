"use client";

import { useMemo, useState } from "react";
import { CATEGORY_LABELS, type DeviceCategory } from "@/lib/content/schema";
import {
  categoryCounts,
  filterDevices,
  filterToSearchParams,
  type DeviceFilter,
  type DeviceListItem,
} from "@/lib/devices/filter";
import { DeviceRow } from "./DeviceRow";
import { Icon } from "@/components/ui/Icon";

const PAGE_SIZE = 40;

export function DeviceBrowser({
  devices,
  manufacturers,
  initialFilter,
}: {
  devices: DeviceListItem[];
  manufacturers: { id: string; name: string }[];
  initialFilter: DeviceFilter;
}) {
  const [filter, setFilterState] = useState<DeviceFilter>(initialFilter);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const results = useMemo(() => filterDevices(devices, filter), [devices, filter]);
  const counts = useMemo(() => categoryCounts(devices, filter), [devices, filter]);
  const categories = useMemo(
    () => [...new Set(devices.map((d) => d.category))].sort((a, b) => CATEGORY_LABELS[a].localeCompare(CATEGORY_LABELS[b])),
    [devices],
  );
  const active = Boolean(filter.query?.trim() || filter.category || filter.manufacturerId);

  function setFilter(next: DeviceFilter) {
    setFilterState(next);
    setLimit(PAGE_SIZE);
    // Keep the URL shareable and Back-button friendly without a server round trip.
    window.history.replaceState(null, "", `${window.location.pathname}${filterToSearchParams(next)}`);
  }

  const chip = (label: string, value: DeviceCategory | undefined, count?: number) => {
    const selected = filter.category === value;
    return (
      <button
        key={label}
        type="button"
        aria-pressed={selected}
        onClick={() => setFilter({ ...filter, category: value })}
        disabled={count === 0 && !selected}
        className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors disabled:opacity-40 ${
          selected ? "border-signal-500/60 bg-signal-500/15 text-signal-300" : "border-line-strong text-fg-muted hover:text-fg"
        }`}
      >
        {label}
        {count !== undefined && <span className="font-mono text-xs opacity-70">{count}</span>}
      </button>
    );
  };

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="group relative flex-1">
          <label htmlFor="device-query" className="sr-only">
            Search devices by model, manufacturer or type
          </label>
          <Icon
            name="search"
            className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-fg-subtle group-focus-within:text-signal-400"
          />
          <input
            id="device-query"
            type="search"
            inputMode="search"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={filter.query ?? ""}
            onChange={(e) => setFilter({ ...filter, query: e.target.value })}
            placeholder="Model or manufacturer"
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

      <div role="group" aria-label="Category" className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {chip("All", undefined)}
        {categories.map((c) => chip(CATEGORY_LABELS[c], c, counts.get(c) ?? 0))}
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
        <p className="rounded-2xl border border-line bg-ink-900 px-4 py-6 text-sm leading-relaxed text-fg-muted">
          No devices match. Check the model number, or clear the filters to see the full library.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-ink-900">
          {results.slice(0, limit).map((d) => (
            <li key={d.id}>
              <DeviceRow device={d} />
            </li>
          ))}
        </ul>
      )}
      {results.length > limit && (
        <button
          type="button"
          onClick={() => setLimit(limit + PAGE_SIZE)}
          className="mt-3 h-12 w-full rounded-xl border border-line-strong text-sm font-medium text-fg-muted hover:text-fg"
        >
          Show more ({results.length - limit} remaining)
        </button>
      )}
    </div>
  );
}
