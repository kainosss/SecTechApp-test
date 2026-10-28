import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDiagnosticWorkflow, WORKFLOWS } from "@/lib/fault-finder/workflows";
import { Diagnosis } from "@/components/fault-finder/Diagnosis";
import { Icon } from "@/components/ui/Icon";

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
  return WORKFLOWS.map((w) => ({ id: w.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const wf = getDiagnosticWorkflow((await params).id);
  return { title: wf ? `${wf.title} · Fault Finder` : "Fault Finder" };
}

export default async function DiagnosePage({ params }: Props) {
  const wf = getDiagnosticWorkflow((await params).id);
  if (!wf) notFound();
  return (
    <>
      <Link href="/fault-finder" className="-ml-2 mb-2 inline-flex h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-fg-muted hover:bg-ink-850 hover:text-fg">
        <Icon name="chevron-right" className="size-4 rotate-180" />
        All faults
      </Link>
      <header className="mb-4">
        <p className="mb-1 font-mono text-xs tracking-[0.18em] text-signal-400 uppercase">Guided Fault Finder</p>
        <h1 className="text-xl font-semibold tracking-tight text-balance text-fg sm:text-3xl">{wf.title}</h1>
        <p className="mt-1 max-w-2xl text-[15px] leading-relaxed text-fg-muted">{wf.summary}</p>
      </header>
      <Diagnosis workflowId={wf.id} />
    </>
  );
}
