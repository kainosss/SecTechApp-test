import Link from "next/link";
import { getContentStats, listDevices } from "@/lib/content/repository";
import { buildSearchIndex } from "@/lib/search/build-index";
import { TOOLS } from "@/lib/navigation";
import { UniversalSearch } from "@/components/dashboard/UniversalSearch";
import { ToolCards } from "@/components/dashboard/ToolCards";
import { DeviceShortlists } from "@/components/dashboard/DeviceShortlists";
import { DemoNotice } from "@/components/ui/DemoNotice";

export default async function DashboardPage() {
  const [index, devices, stats] = await Promise.all([buildSearchIndex(), listDevices(), getContentStats()]);

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <section className="relative -mx-4 overflow-hidden border-b border-line px-4 pt-2 pb-6 sm:mx-0 sm:rounded-2xl sm:border sm:bg-ink-900 sm:p-8">
        <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]" aria-hidden="true" />
        <div className="relative">
          <p className="font-mono text-[11px] tracking-[0.2em] text-signal-400 uppercase">On-site reference</p>
          <h1 className="mt-2 text-[26px] leading-tight font-semibold tracking-tight text-balance text-fg sm:text-3xl">
            What are you working on?
          </h1>
          <p className="mt-1.5 text-[15px] text-fg-muted">Search by model number, brand or device type.</p>
          <div className="mt-5">
            <UniversalSearch index={index} />
          </div>
        </div>
      </section>

      <DemoNotice compact />

      <section aria-labelledby="tools-heading">
        <h2 id="tools-heading" className="mb-3 font-mono text-xs tracking-[0.18em] text-fg-subtle uppercase">
          Tools
        </h2>
        <ToolCards tools={TOOLS} />
      </section>

      <DeviceShortlists devices={devices} />

      <section aria-labelledby="library-heading" className="rounded-2xl border border-line bg-ink-900 p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <h2 id="library-heading" className="text-sm font-semibold text-fg">
            Library status
          </h2>
          <Link href="/devices" className="text-sm font-medium text-signal-400 hover:text-signal-300">
            Browse devices
          </Link>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-line sm:grid-cols-4">
          {[
            ["Devices", stats.devices],
            ["Manufacturers", stats.manufacturers],
            ["Verified", stats.verified],
            ["Needs verification", stats.needsVerification],
          ].map(([label, value]) => (
            <div key={label} className="bg-ink-850 px-4 py-3">
              <dt className="text-xs text-fg-muted">{label}</dt>
              <dd className="mt-0.5 font-mono text-xl font-medium text-fg tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
