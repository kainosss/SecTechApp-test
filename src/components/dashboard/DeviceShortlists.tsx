"use client";

import type { DeviceSummary } from "@/lib/content/repository";
import { useFavouriteDevices, useRecentDevices } from "@/lib/storage/use-device-lists";
import { DeviceRow } from "@/components/devices/DeviceRow";
import { Icon, type IconKey } from "@/components/ui/Icon";

function resolve(ids: string[], devices: DeviceSummary[]): DeviceSummary[] {
  const byId = new Map(devices.map((d) => [d.id, d]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

function Panel({
  title,
  icon,
  items,
  empty,
  action,
}: {
  title: string;
  icon: IconKey;
  items: DeviceSummary[];
  empty: string;
  action?: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`${icon}-heading`} className="rounded-2xl border border-line bg-ink-900">
      <div className="flex h-12 items-center justify-between border-b border-line px-4">
        <h2 id={`${icon}-heading`} className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Icon name={icon} className="size-4 text-signal-400" />
          {title}
        </h2>
        {action}
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm leading-relaxed text-fg-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((d) => (
            <li key={d.id}>
              <DeviceRow device={d} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function DeviceShortlists({ devices }: { devices: DeviceSummary[] }) {
  const recent = useRecentDevices();
  const favourites = useFavouriteDevices();
  const recentItems = resolve(recent.ids, devices).slice(0, 5);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel
        title="Recently viewed"
        icon="clock"
        items={recentItems}
        empty="Devices you open will appear here so you can get back to them quickly on site."
        action={
          recentItems.length > 0 ? (
            <button type="button" onClick={recent.clear} className="h-9 px-2 text-xs font-medium text-fg-subtle hover:text-fg">
              Clear
            </button>
          ) : undefined
        }
      />
      <Panel
        title="Favourites"
        icon="star"
        items={resolve(favourites.ids, devices)}
        empty="Tap the star on any device page to keep the equipment you install most often one tap away."
      />
    </div>
  );
}
