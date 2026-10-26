"use client";

import { useFavouriteDevices } from "@/lib/storage/use-device-lists";
import { Icon } from "@/components/ui/Icon";

export function FavouriteButton({ deviceId }: { deviceId: string }) {
  const { isFavourite, toggle } = useFavouriteDevices();
  const active = isFavourite(deviceId);
  return (
    <button
      type="button"
      onClick={() => toggle(deviceId)}
      aria-pressed={active}
      className={`inline-flex h-11 items-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors ${
        active
          ? "border-signal-500/50 bg-signal-500/10 text-signal-300"
          : "border-line-strong bg-ink-850 text-fg-muted hover:text-fg"
      }`}
    >
      <Icon name={active ? "star-filled" : "star"} className="size-[18px]" />
      {active ? "Saved to favourites" : "Add to favourites"}
    </button>
  );
}
