import type { Metadata } from "next";
import Link from "next/link";
import { getDevices, getManufacturer, getManufacturers, toDeviceSummary } from "@/lib/content/repository";
import { CATEGORY_LABELS, deviceCategorySchema, type DeviceCategory } from "@/lib/content/schema";
import { DeviceRow } from "@/components/devices/DeviceRow";
import { DemoNotice } from "@/components/ui/DemoNotice";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Device Library" };

export default async function DevicesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; manufacturer?: string }>;
}) {
  const params = await searchParams;
  const parsedCategory = deviceCategorySchema.safeParse(params.category);
  const category: DeviceCategory | undefined = parsedCategory.success ? parsedCategory.data : undefined;
  const manufacturer = params.manufacturer ? getManufacturer(params.manufacturer) : undefined;

  const all = getDevices();
  const devices = getDevices({ category, manufacturerId: manufacturer?.id }).map(toDeviceSummary);
  const categories = [...new Set(all.map((d) => d.category))];

  const chip = (label: string, href: string, active: boolean) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? "true" : undefined}
      className={`inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium ${
        active ? "border-signal-500/60 bg-signal-500/15 text-signal-300" : "border-line-strong text-fg-muted hover:text-fg"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader
        eyebrow="Device Library · Preview"
        title={manufacturer ? manufacturer.name : "Device Library"}
        description="Terminal functions, power requirements and the source documents behind them. Full device pages arrive in Phase 2."
      />
      <div className="mb-4">
        <DemoNotice compact />
      </div>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {chip("All", manufacturer ? `/devices?manufacturer=${manufacturer.id}` : "/devices", !category)}
        {categories.map((c) =>
          chip(
            CATEGORY_LABELS[c],
            `/devices?category=${c}${manufacturer ? `&manufacturer=${manufacturer.id}` : ""}`,
            c === category,
          ),
        )}
      </div>
      {devices.length === 0 ? (
        <p className="rounded-2xl border border-line bg-ink-900 px-4 py-6 text-sm text-fg-muted">No devices match this filter.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-ink-900">
          {devices.map((d) => (
            <li key={d.id}>
              <DeviceRow device={d} />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-xs text-fg-subtle">
        {getManufacturers().length} manufacturers · {all.length} devices in this build
      </p>
    </>
  );
}
