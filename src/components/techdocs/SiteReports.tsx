"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { createReport, newId } from "@/lib/reports/report";
import { JOB_TYPES, type JobType } from "@/lib/reports/schema";
import { loadTechnician, parseReports, readRaw, saveReport, subscribeReports } from "@/lib/reports/store";
import { linkReport } from "@/lib/sites/link";
import type { TechRegister } from "@/lib/techdocs/schema";

const JOB_LABEL = Object.fromEntries(JOB_TYPES.map((j) => [j.id, j.label])) as Record<JobType, string>;

/** Service reports linked to this site, and a quick way to start a new one already linked to it. */
export function SiteReports({ register }: { register: TechRegister }) {
  const raw = useSyncExternalStore(subscribeReports, () => readRaw() ?? "", () => "");
  const linked = useMemo(
    () => parseReports(raw || null).reports.filter((r) => r.registerId === register.id).sort((a, b) => (b.date || b.updatedAt).localeCompare(a.date || a.updatedAt)),
    [raw, register.id],
  );

  // Each button links to a report id chosen in advance; the report is created only when tapped, then a fresh id is drawn.
  const [nextId, setNextId] = useState(newId);
  const start = (jobType: JobType) => {
    saveReport(linkReport({ ...createReport(jobType, loadTechnician().name || register.technician), id: nextId }, register, false));
    setNextId(newId());
  };

  return (
    <section aria-labelledby="site-reports-heading" className="rounded-2xl border border-line bg-ink-900 p-4" data-testid="site-reports">
      <h2 id="site-reports-heading" className="text-[15px] font-semibold text-fg">
        Service reports for this site ({linked.length})
      </h2>
      {linked.length > 0 && (
        <ul className="mt-2 flex flex-col" aria-label="Linked service reports">
          {linked.map((r) => (
            <li key={r.id}>
              <Link href={`/reports?id=${encodeURIComponent(r.id)}`} className="flex min-h-11 items-center justify-between gap-2 border-b border-line py-2 text-sm text-fg last:border-0 hover:text-signal-300">
                <span className="min-w-0">
                  <span className="block font-medium">{[JOB_LABEL[r.jobType], r.reference].filter(Boolean).join(" · ")}</span>
                  <span className="block text-xs text-fg-muted">
                    {r.date ? new Date(`${r.date}T00:00:00`).toLocaleDateString("en-AU") : "No date"} · {r.equipment.length} item{r.equipment.length === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-medium text-signal-400">Open</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-sm text-fg-muted">New service report, linked to this site:</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {JOB_TYPES.map((j) => (
          <Link
            key={j.id}
            href={`/reports?id=${encodeURIComponent(nextId)}`}
            onClick={() => start(j.id)}
            className="inline-flex h-11 items-center justify-center rounded-lg border border-line-strong px-3 text-sm font-medium text-fg hover:bg-ink-800"
          >
            {j.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
