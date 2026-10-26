import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getWorkflow, listWorkflows } from "@/lib/content/repository";
import { CATEGORY_LABELS, FAULT_AREA_LABELS, groupForCategory } from "@/lib/content/schema";
import { DeviceSection } from "@/components/devices/DeviceSection";
import { DocumentList } from "@/components/devices/DocumentList";
import { LinkedDevices } from "@/components/records/LinkedDevices";
import { RECORD_STATUS_EXPLANATION } from "@/components/records/explanations";
import { Icon } from "@/components/ui/Icon";
import { StatusPanel } from "@/components/ui/StatusPanel";

type Props = { params: Promise<{ id: string }> };

export async function generateStaticParams() {
  return (await listWorkflows()).map((r) => ({ id: r.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const record = await getWorkflow((await params).id);
  return { title: record?.title ?? "Workflow not found" };
}

export default async function WorkflowPage({ params }: Props) {
  const record = await getWorkflow((await params).id);
  if (!record) notFound();

  return (
    <article className="flex flex-col gap-4">
      <div>
        <Link
          href="/fault-finder"
          className="-ml-2 inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-fg-muted hover:bg-ink-850 hover:text-fg"
        >
          <Icon name="chevron-right" className="size-4 rotate-180" />
          Troubleshooting workflows
        </Link>
      </div>
      <header>
        <p className="font-mono text-xs tracking-[0.18em] text-signal-400 uppercase">{FAULT_AREA_LABELS[record.faultArea]} fault</p>
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

      <DeviceSection id="symptoms" title="Symptoms">
        <ul className="flex flex-col gap-2 p-4">
          {record.symptoms.map((s) => (
            <li key={s} className="flex gap-3 text-[15px] text-fg">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-signal-400" aria-hidden="true" />
              {s}
            </li>
          ))}
        </ul>
      </DeviceSection>

      {record.outline.length > 0 && (
        <DeviceSection id="outline" title="Fault-finding outline">
          <ol className="divide-y divide-line">
            {record.outline.map((step, i) => (
              <li key={step.title} className="flex gap-3 px-4 py-3">
                <span className="font-mono text-sm leading-6 text-signal-400">{String(i + 1).padStart(2, "0")}</span>
                <span>
                  <span className="block text-[15px] font-medium text-fg">{step.title}</span>
                  {step.detail && <span className="mt-0.5 block text-sm leading-relaxed text-fg-muted">{step.detail}</span>}
                </span>
              </li>
            ))}
          </ol>
          <p className="border-t border-line px-4 py-3 text-xs leading-relaxed text-fg-subtle">
            Interactive diagnostic questions and test procedures will be added when the Guided Fault Finder is released.
          </p>
        </DeviceSection>
      )}

      <DeviceSection id="devices" title="Applies to">
        {record.categories.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pt-3 pb-1">
            {record.categories.map((c) => (
              <Link
                key={c}
                href={`/devices?group=${groupForCategory(c)}`}
                className="inline-flex h-9 items-center rounded-full border border-line-strong px-3.5 text-sm text-fg-muted hover:text-fg"
              >
                {CATEGORY_LABELS[c]}
              </Link>
            ))}
          </div>
        )}
        <LinkedDevices devices={record.devices} empty="No specific devices are linked to this workflow." />
      </DeviceSection>

      <DeviceSection id="sources" title="Sources">
        <DocumentList documents={record.sources} empty="No source documents are cited. This outline is general guidance only." />
      </DeviceSection>
    </article>
  );
}
