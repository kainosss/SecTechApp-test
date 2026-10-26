import Link from "next/link";
import type { DeviceListItem as DeviceSummary } from "@/lib/content/repository";
import { CATEGORY_LABELS } from "@/lib/content/schema";
import { Icon } from "@/components/ui/Icon";
import { VerificationBadge } from "@/components/ui/VerificationBadge";

export function DeviceRow({ device }: { device: DeviceSummary }) {
  return (
    <Link
      href={`/devices/${device.id}`}
      className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-ink-850 active:bg-ink-800"
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-[15px] font-medium text-fg">{device.model}</span>
          <VerificationBadge status={device.status} />
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-fg-muted">
          {device.manufacturerName} · {CATEGORY_LABELS[device.category]}
        </span>
      </span>
      <Icon name="chevron-right" className="size-4 shrink-0 text-fg-subtle" />
    </Link>
  );
}
