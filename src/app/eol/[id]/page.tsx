import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getWiringConfiguration, listWiringConfigurations } from "@/lib/content/repository";
import { WIRING_INPUT_LABELS } from "@/lib/content/schema";
import { DeviceSection } from "@/components/devices/DeviceSection";
import { DocumentList } from "@/components/devices/DocumentList";
import { LinkedDevices } from "@/components/records/LinkedDevices";
import { RECORD_STATUS_EXPLANATION } from "@/components/records/explanations";
import { Icon } from "@/components/ui/Icon";
import { StatusPanel } from "@/components/ui/StatusPanel";

type Props = { params: Promise<{ id: string }> };

export async function generateStaticParams() {
  return (await listWiringConfigurations()).map((r) => ({ id: r.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const record = await getWiringConfiguration((await params).id);
  return { title: record?.title ?? "Wiring configuration not found" };
}

const RESISTOR_ROLE: Record<string, string> = {
  "end-of-line": "End-of-line resistor",
  alarm: "Alarm resistor",
  tamper: "Tamper resistor",
  other: "Resistor",
};

function formatOhms(ohms: number) {
  return ohms >= 1000 ? `${(ohms / 1000).toLocaleString("en-AU", { maximumFractionDigits: 2 })} kΩ` : `${ohms} Ω`;
}

export default async function WiringPage({ params }: Props) {
  const record = await getWiringConfiguration((await params).id);
  if (!record) notFound();

  return (
    <article className="flex flex-col gap-4">
      <div>
        <Link href="/eol" className="-ml-2 inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-fg-muted hover:bg-ink-850 hover:text-fg">
          <Icon name="chevron-right" className="size-4 rotate-180" />
          Wiring configurations
        </Link>
      </div>
      <header>
        <p className="font-mono text-xs tracking-[0.18em] text-signal-400 uppercase">Wiring configuration</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-balance text-fg sm:text-3xl">{record.title}</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-fg-muted">{record.summary}</p>
      </header>

      <StatusPanel
        status={record.status}
        explanation={RECORD_STATUS_EXPLANATION[record.status]}
        updatedAt={record.updatedAt}
        review={record.review}
        notes={record.statusNotes}
      />

      <DeviceSection id="configuration" title="Configuration">
        <dl className="divide-y divide-line">
          <div className="grid gap-0.5 px-4 py-2.5 sm:grid-cols-[12rem_1fr] sm:gap-4">
            <dt className="text-sm text-fg-muted">Input type</dt>
            <dd className="text-[15px] text-fg">{WIRING_INPUT_LABELS[record.inputType]}</dd>
          </div>
          <div className="grid gap-0.5 px-4 py-2.5 sm:grid-cols-[12rem_1fr] sm:gap-4">
            <dt className="text-sm text-fg-muted">Contact arrangement</dt>
            <dd className="text-[15px] text-fg">{record.contactArrangement}</dd>
          </div>
          {record.resistors.map((r, i) => (
            <div key={i} className="grid gap-0.5 px-4 py-2.5 sm:grid-cols-[12rem_1fr] sm:gap-4">
              <dt className="text-sm text-fg-muted">{RESISTOR_ROLE[r.role]}</dt>
              <dd className="font-mono text-[15px] text-fg">{formatOhms(r.ohms)}</dd>
            </div>
          ))}
          {record.appliesToRevisions.length > 0 && (
            <div className="grid gap-0.5 px-4 py-2.5 sm:grid-cols-[12rem_1fr] sm:gap-4">
              <dt className="text-sm text-fg-muted">Checked against revisions</dt>
              <dd className="text-[15px] text-fg">{record.appliesToRevisions.join(", ")}</dd>
            </div>
          )}
        </dl>
        {record.notes && <p className="border-t border-line px-4 py-3 text-sm text-fg-muted">{record.notes}</p>}
        <p className="border-t border-line px-4 py-3 text-xs leading-relaxed text-fg-subtle">
          Wiring diagrams and expected resistance states will be shown here once the interactive EOL Wiring Assistant is released.
        </p>
      </DeviceSection>

      <DeviceSection id="devices" title="Applies to">
        <LinkedDevices devices={record.devices} empty="No devices in the library are linked to this configuration." />
      </DeviceSection>

      <DeviceSection id="sources" title="Sources">
        <DocumentList documents={record.sources} empty="No source documents are cited for this configuration." />
      </DeviceSection>
    </article>
  );
}
