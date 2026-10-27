import type { Metadata } from "next";
import { listWorkflows } from "@/lib/content/repository";
import { FAULT_AREA_LABELS } from "@/lib/content/schema";
import { GuideList } from "@/components/fault-finder/GuideList";
import { RecordList } from "@/components/records/RecordList";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = { title: "Guided Fault Finder" };

export default async function FaultFinderPage() {
  const records = await listWorkflows();
  return (
    <>
      <PageHeader
        eyebrow="Guided Fault Finder"
        title="What's the fault?"
        description="Pick a problem, answer short questions and enter your meter readings. Each answer changes the next step, and you get likely causes, checks and when to escalate."
      />
      <GuideList />
      <aside className="mt-6 flex gap-3 rounded-2xl border border-line bg-ink-900 px-4 py-3 text-sm text-fg-muted">
        <Icon name="shield" className="mt-0.5 size-4 shrink-0 text-verified" />
        <p className="leading-relaxed">
          Generic service guidance, not manufacturer instructions. Example values such as 2k2 / 4k4 and 10k / 20k dual EOL are illustrations — panels differ in
          their EOL values and in how they report open, short and tamper. Measure resistance only on isolated, de-energised circuits.
        </p>
      </aside>
      {records.length > 0 && (
        <div className="mt-6">
          <RecordList
            title="Troubleshooting workflows"
            items={records.map((r) => ({
              id: r.id,
              href: `/fault-finder/${r.id}`,
              title: r.title,
              status: r.status,
              meta: FAULT_AREA_LABELS[r.faultArea],
            }))}
            empty="No troubleshooting workflow records have been published yet."
          />
        </div>
      )}
    </>
  );
}
