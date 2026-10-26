import Link from "next/link";
import type { LinkedRecordDetail } from "@/lib/content/repository";
import { Icon } from "@/components/ui/Icon";
import { VerificationBadge } from "@/components/ui/VerificationBadge";

export function LinkedDevices({ devices, empty }: { devices: LinkedRecordDetail["devices"]; empty: string }) {
  if (devices.length === 0) return <p className="px-4 py-4 text-sm leading-relaxed text-fg-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {devices.map((d) => (
        <li key={d.id}>
          <Link href={`/devices/${d.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-ink-850 active:bg-ink-800">
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-mono text-[15px] font-medium text-fg">{d.model}</span>
                <VerificationBadge status={d.status} />
              </span>
              <span className="mt-0.5 block text-[13px] text-fg-muted">{d.manufacturerName}</span>
            </span>
            <Icon name="chevron-right" className="size-4 shrink-0 text-fg-subtle" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
