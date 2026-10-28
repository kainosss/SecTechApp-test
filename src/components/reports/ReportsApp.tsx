"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useUrlSearch } from "@/lib/eol/use-url-selection";
import { downloadWorkbook } from "@/lib/reports/download";
import { createReport, duplicateReport, statusCounts } from "@/lib/reports/report";
import { JOB_TYPES, type JobType, type Report } from "@/lib/reports/schema";
import { clearReports, deleteReport, loadTechnician, parseReports, readRaw, saveReport, subscribeReports } from "@/lib/reports/store";
import { BackupPanel, BackupReminder } from "@/components/backup/BackupPanel";
import { DemoInvite } from "@/components/demo/DemoWorkspaceBanner";
import { ReportEditor } from "./ReportEditor";
import { markReportDeleted, markReportRestored } from "@/lib/sites/link";
import { updateAllRegisters } from "@/lib/techdocs/store";

const JOB_LABEL = Object.fromEntries(JOB_TYPES.map((j) => [j.id, j.label])) as Record<JobType, string>;

/** Reports home (start, resume, manage drafts) and the editor, switched by `?id=` so Back works on phones. */
export function ReportsApp() {
  const { search, setSearch } = useUrlSearch();
  const id = new URLSearchParams(search).get("id");
  const raw = useSyncExternalStore(subscribeReports, () => readRaw() ?? "", () => "");
  const { reports, skipped } = useMemo(() => parseReports(raw || null), [raw]);
  const [deleted, setDeleted] = useState<Report | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (id) return <ReportEditor key={id} id={id} onClose={() => setSearch("", "push")} />;

  const open = (r: Report) => setSearch(`?id=${encodeURIComponent(r.id)}`, "push");
  const start = (jobType: JobType) => {
    const r = createReport(jobType, loadTechnician().name);
    saveReport(r);
    open(r);
  };

  return (
    <div className="flex flex-col gap-5">
      <BackupReminder />
      <section aria-labelledby="new-heading" className="rounded-2xl border border-line bg-ink-900 p-4">
        <h2 id="new-heading" className="text-[15px] font-semibold text-fg">
          Start a new report
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {JOB_TYPES.map((j) => (
            <button
              key={j.id}
              type="button"
              onClick={() => start(j.id)}
              className="h-14 rounded-xl border border-line-strong bg-ink-850 px-3 text-[15px] font-semibold text-fg hover:border-signal-400 hover:bg-ink-800"
            >
              {j.label}
            </button>
          ))}
        </div>
      </section>

      <p className="rounded-xl border border-unverified/30 bg-unverified/[0.05] px-4 py-3 text-sm leading-relaxed text-fg" role="note" data-testid="storage-warning">
        <span className="font-semibold text-unverified">Saved in this browser only.</span> Reports stay on this device and aren&apos;t backed up — clearing browser
        data, private browsing or a different device means they&apos;re gone. Generate the Excel file before you leave site.
      </p>

      <section aria-labelledby="drafts-heading" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="drafts-heading" className="text-[15px] font-semibold text-fg">
            Your reports ({reports.length})
          </h2>
          {reports.length > 0 &&
            (confirmClear ? (
              <span className="flex items-center gap-2 text-sm">
                <span className="text-fg">Delete all {reports.length} reports from this device?</span>
                <button
                  type="button"
                  onClick={() => {
                    const ids = reports.map((x) => x.id);
                    clearReports();
                    // History events from these reports stay, marked as from deleted reports.
                    updateAllRegisters((reg) => ids.reduce((acc, id) => markReportDeleted(acc, id), reg));
                    setConfirmClear(false);
                  }}
                  className="h-11 rounded-lg border border-fault/50 px-3 font-medium text-fault hover:bg-fault/10"
                >
                  Delete all
                </button>
                <button type="button" onClick={() => setConfirmClear(false)} className="h-11 rounded-lg border border-line-strong px-3 font-medium text-fg hover:bg-ink-800">
                  Cancel
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmClear(true)} className="h-11 rounded-lg px-2 text-sm font-medium text-fg-muted hover:text-fault">
                Clear saved reports
              </button>
            ))}
        </div>
        {skipped > 0 && (
          <p className="text-sm text-amber-300" role="status">
            {skipped} saved report{skipped === 1 ? "" : "s"} couldn&apos;t be read (damaged or from an older version) and {skipped === 1 ? "is" : "are"} not shown.
          </p>
        )}
        {deleted && (
          <p className="flex items-center justify-between gap-2 rounded-lg bg-ink-850 px-3 py-2 text-sm text-fg" role="status">
            Deleted {deleted.siteName || "untitled report"}.
            <button
              type="button"
              onClick={() => {
                saveReport(deleted);
                updateAllRegisters((reg) => markReportRestored(reg, deleted.id));
                setDeleted(null);
              }}
              className="h-11 px-2 font-semibold text-signal-400 hover:text-signal-300"
            >
              Undo
            </button>
          </p>
        )}
        {message && (
          <p className="text-sm text-fg-muted" role="status">
            {message}
          </p>
        )}
        {reports.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-fg-muted">No reports yet. Pick a job type above to start one.</p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Saved reports">
            {reports.map((r) => {
              const c = statusCounts(r);
              return (
                <li key={r.id} className="rounded-2xl border border-line bg-ink-900 p-3" data-report={r.id}>
                  <button type="button" onClick={() => open(r)} className="block w-full min-h-11 text-left">
                    <span className="block text-[15px] font-semibold text-fg">{r.siteName || "Untitled report"}</span>
                    <span className="block text-xs text-fg-muted">
                      {JOB_LABEL[r.jobType]}
                      {r.reference ? ` · ${r.reference}` : ""}
                      {r.date ? ` · ${r.date}` : ""} · {r.equipment.length} item{r.equipment.length === 1 ? "" : "s"}
                      {c.fault ? ` · ${c.fault} fault${c.fault === 1 ? "" : "s"}` : ""}
                    </span>
                  </button>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => open(r)} className="h-11 rounded-lg bg-signal-500 px-3 text-sm font-semibold text-ink-950 hover:bg-signal-400">
                      Continue
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          setMessage(`Downloaded ${await downloadWorkbook(r)}`);
                        } catch {
                          setMessage("Couldn't create the Excel file. Try again.");
                        }
                      }}
                      className="h-11 rounded-lg border border-line-strong px-3 text-sm font-medium text-fg hover:bg-ink-800"
                    >
                      Excel
                    </button>
                    <button type="button" onClick={() => saveReport(duplicateReport(r))} className="h-11 rounded-lg border border-line-strong px-3 text-sm font-medium text-fg hover:bg-ink-800">
                      Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        deleteReport(r.id);
                        updateAllRegisters((reg) => markReportDeleted(reg, r.id));
                        setDeleted(r);
                      }}
                      className="h-11 rounded-lg px-3 text-sm font-medium text-fg-muted hover:text-fault"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <DemoInvite />
      <BackupPanel />
    </div>
  );
}
