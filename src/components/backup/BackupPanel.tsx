"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { downloadFullBackup, latestChange } from "@/lib/backup/download";
import { parseMeta, readMetaRaw, shouldRemind, snoozeReminder, subscribeMeta } from "@/lib/backup/meta";
import { loadBranding } from "@/lib/handover/branding";
import { loadReports, parseReports, readRaw as readReportsRaw, subscribeReports } from "@/lib/reports/store";
import { MAX_BACKUP_BYTES, parseBackup, planImport, summarise, type Backup, type ImportMode } from "@/lib/techdocs/backup";
import { commitImport, loadRegisters, parseRegisters, readRegistersRaw, subscribeRegisters } from "@/lib/techdocs/store";

const button = "h-11 rounded-lg border border-line-strong px-3 text-sm font-medium text-fg hover:bg-ink-800 disabled:opacity-50";
const primary = "h-11 rounded-lg bg-signal-500 px-4 text-sm font-semibold text-ink-950 hover:bg-signal-400 disabled:opacity-50";

const list = (titles: string[]) => (titles.length > 6 ? `${titles.slice(0, 6).join(", ")} and ${titles.length - 6} more` : titles.join(", "));
const when = (iso: string) => new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

/** Registers, reports and backup bookkeeping from this device, kept current. */
function useLocalData() {
  const regRaw = useSyncExternalStore(subscribeRegisters, () => readRegistersRaw() ?? "", () => "");
  const repRaw = useSyncExternalStore(subscribeReports, () => readReportsRaw() ?? "", () => "");
  const metaRaw = useSyncExternalStore(subscribeMeta, readMetaRaw, () => "");
  return useMemo(() => {
    const registers = parseRegisters(regRaw || null).registers;
    const reports = parseReports(repRaw || null).reports;
    return { registers, reports, meta: parseMeta(metaRaw), latest: latestChange(registers, reports) };
  }, [regRaw, repRaw, metaRaw]);
}

/** A quiet, snoozable reminder to back up when there are changes since the last backup. */
export function BackupReminder() {
  const { meta, latest } = useLocalData();
  const [message, setMessage] = useState<string | null>(null);
  if (message) {
    return (
      <p className="rounded-xl border border-line px-4 py-2 text-sm text-fg-muted" role="status">
        {message}
      </p>
    );
  }
  if (!shouldRemind(meta, latest)) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-signal-400/40 bg-signal-500/[0.05] px-4 py-3 text-sm text-fg" role="note" data-testid="backup-reminder">
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Back up your Fieldwise data.</span>{" "}
        {meta.lastBackupAt ? `Last backup from this device: ${when(meta.lastBackupAt)}.` : "No backup has been downloaded from this device yet."} Browser storage isn&apos;t a cloud backup.
      </p>
      <button type="button" className={primary} onClick={() => setMessage(`Downloaded ${downloadFullBackup()}. Keep it somewhere safe.`)}>
        Back up now
      </button>
      <button type="button" className="h-11 px-2 text-sm font-medium text-fg-muted hover:text-fg" onClick={() => snoozeReminder()}>
        Remind me next week
      </button>
    </div>
  );
}

/** Complete backup to a file, and restore from one with a preview and an explicit merge or replace. */
export function BackupPanel() {
  const data = useLocalData();
  const input = useRef<HTMLInputElement>(null);
  const [backup, setBackup] = useState<Backup | null>(null);
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState<ImportMode>("merge");
  const [brandingChoice, setBrandingChoice] = useState<"keep" | "import">("keep");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const hasData = data.registers.length + data.reports.length > 0;

  const reset = () => {
    setBackup(null);
    setConfirmReplace(false);
    setMode("merge");
    setBrandingChoice("keep");
    if (input.current) input.current.value = "";
  };

  async function onFile(file: File | undefined) {
    reset();
    setMessage(null);
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) return setMessage({ text: "This file is too large to be a Fieldwise backup.", error: true });
    let text: string;
    try {
      text = await file.text();
    } catch {
      return setMessage({ text: "The file couldn't be read.", error: true });
    }
    const res = parseBackup(text);
    if (!res.ok) return setMessage({ text: res.error, error: true });
    setFileName(file.name);
    setBackup(res.backup);
  }

  const existing = () => ({ registers: loadRegisters().registers, reports: loadReports().reports, branding: loadBranding() });
  const plan = backup ? planImport(backup, existing(), mode, { brandingChoice }) : null;
  const summary = backup ? summarise(backup) : null;
  const removing = plan ? plan.removed.length + plan.reportsRemoved : 0;

  return (
    <section aria-labelledby="backup-heading" className="rounded-2xl border border-line bg-ink-900 p-4" data-testid="backup">
      <h2 id="backup-heading" className="text-[15px] font-semibold text-fg">
        Backup &amp; restore
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-fg-muted">
        Browser storage is <strong className="text-fg">not a cloud backup</strong> — data can be lost if browser data is cleared or the device is replaced. A backup file holds
        everything: Technical Docs registers (equipment, custom fields, history), all service reports and your company branding and logo. Keep it somewhere safe and secure —
        it contains site configuration. Excel and PDF exports are documents, not backups, and can&apos;t be restored. Nothing is uploaded.
      </p>
      <p className="mt-2 text-xs text-fg-muted" data-testid="last-backup">
        {data.meta.lastBackupAt ? `Last backup downloaded on this device: ${when(data.meta.lastBackupAt)}` : "No backup downloaded on this device yet."}
        {data.meta.lastBackupAt && data.latest > data.meta.lastBackupAt ? " · changes since then" : ""}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={primary} disabled={!hasData} onClick={() => setMessage({ text: `Downloaded ${downloadFullBackup()}` })}>
          Download backup
        </button>
        <button type="button" className={button} onClick={() => input.current?.click()}>
          Restore from file…
        </button>
        <input ref={input} type="file" accept=".json,application/json" className="hidden" aria-label="Backup file" onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
      {message && (
        <p className={`mt-2 text-sm ${message.error ? "text-fault" : "text-fg-muted"}`} role={message.error ? "alert" : "status"}>
          {message.text}
        </p>
      )}

      {backup && plan && summary && (
        <div className="mt-3 flex flex-col gap-3 rounded-xl border border-signal-400/40 bg-ink-850 p-3 text-sm text-fg" data-testid="restore-preview">
          <div>
            <p className="font-semibold">Backup preview — {fileName}</p>
            <p className="text-fg-muted">
              Saved {when(summary.exportedAt)} · {summary.registers} register{summary.registers === 1 ? "" : "s"} · {summary.equipment} equipment entries · {summary.historyEvents} history
              events · {summary.reports} service report{summary.reports === 1 ? "" : "s"}
            </p>
            <p className="text-fg-muted" data-testid="backup-contents">
              {summary.complete ? "Complete backup" : "Technical Docs backup from an earlier version (registers and their linked reports only)"} ·{" "}
              {summary.branding ? `includes company branding${summary.branding.companyName ? ` (${summary.branding.companyName})` : ""}${summary.branding.logo ? " with logo" : ""}` : "no company branding"}
            </p>
            {summary.titles.length > 0 && <p className="text-fg-muted">Registers: {list(summary.titles)}</p>}
          </div>

          <div role="radiogroup" aria-label="Import method" className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["merge", "Merge", "Add what's new. Nothing on this device is changed or deleted."],
                ["replace", "Replace", summary.complete ? "Delete the registers and reports on this device and use the backup's instead." : "Delete the registers on this device and use the backup's instead."],
              ] as const
            ).map(([id, label, hint]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={mode === id}
                onClick={() => (setMode(id), setConfirmReplace(false))}
                className={`rounded-xl border p-3 text-left ${mode === id ? "border-signal-400 bg-signal-500/10" : "border-line-strong hover:bg-ink-800"}`}
              >
                <span className="block font-semibold">{label}</span>
                <span className="block text-xs text-fg-muted">{hint}</span>
              </button>
            ))}
          </div>

          {plan.brandingConflict && (
            <fieldset className="rounded-lg border border-line p-2" data-testid="branding-choice">
              <legend className="px-1 text-xs font-semibold text-fg">Company branding differs</legend>
              {(
                [
                  ["keep", "Keep the branding on this device"],
                  ["import", `Use the backup's branding${summary.branding?.companyName ? ` (${summary.branding.companyName})` : ""}`],
                ] as const
              ).map(([id, label]) => (
                <label key={id} className="flex min-h-11 items-center gap-2">
                  <input type="radio" name="branding-choice" className="size-5 accent-signal-500" checked={brandingChoice === id} onChange={() => setBrandingChoice(id)} />
                  {label}
                </label>
              ))}
            </fieldset>
          )}

          <ul className="flex flex-col gap-1 text-fg-muted" aria-label="What will happen">
            {plan.added.length > 0 && <li>Add: {list(plan.added)}</li>}
            {plan.unchanged.length > 0 && <li>Already on this device (skipped): {list(plan.unchanged)}</li>}
            {plan.copied.length > 0 && <li>Different version already here — imported as a separate copy: {list(plan.copied)}</li>}
            {plan.removed.length > 0 && <li className="text-fault">Delete from this device: {list(plan.removed)}</li>}
            {plan.reportsRemoved > 0 && (
              <li className="text-fault">
                Delete {plan.reportsRemoved} service report{plan.reportsRemoved === 1 ? "" : "s"} from this device
              </li>
            )}
            {plan.reportsAdded + plan.reportsCopied > 0 && (
              <li>
                Service reports: {plan.reportsAdded} added{plan.reportsCopied ? `, ${plan.reportsCopied} imported as copies (existing reports are never overwritten)` : ""}
              </li>
            )}
            {plan.brandingAction === "added" && <li>Company branding: added</li>}
            {plan.brandingAction === "replaced" && <li>Company branding: replaced with the backup&apos;s</li>}
            {plan.brandingAction === "kept" && <li>Company branding: this device&apos;s is kept</li>}
            {plan.orphanedReports > 0 && (
              <li className="text-amber-300">
                {plan.orphanedReports} service report{plan.orphanedReports === 1 ? "" : "s"} on this device will lose {plan.orphanedReports === 1 ? "its" : "their"} linked register (recorded details are kept).
              </li>
            )}
            {plan.added.length + plan.copied.length + plan.reportsAdded + plan.reportsCopied === 0 && removing === 0 && plan.brandingAction !== "added" && plan.brandingAction !== "replaced" && (
              <li>Nothing new to import.</li>
            )}
          </ul>

          {mode === "replace" && removing > 0 && (
            <label className="flex items-start gap-2 rounded-lg border border-fault/40 p-2">
              <input type="checkbox" className="mt-0.5 size-5 accent-signal-500" checked={confirmReplace} onChange={(e) => setConfirmReplace(e.target.checked)} />
              <span>
                I understand {[plan.removed.length && `${plan.removed.length} register${plan.removed.length === 1 ? "" : "s"}`, plan.reportsRemoved && `${plan.reportsRemoved} service report${plan.reportsRemoved === 1 ? "" : "s"}`].filter(Boolean).join(" and ")} on this
                device will be deleted. (Download a backup of them first if you may need them.)
              </span>
            </label>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={primary}
              disabled={mode === "replace" && removing > 0 && !confirmReplace}
              onClick={() => {
                // Re-plan against current storage at the moment of import, then write everything together (rolled back together on failure).
                const fresh = planImport(backup, existing(), mode, { brandingChoice });
                const ok = commitImport(fresh.registers, fresh.reports, fresh.brandingAction === "added" || fresh.brandingAction === "replaced" ? fresh.branding : undefined);
                setMessage(
                  ok
                    ? {
                        text: `Import complete: ${fresh.added.length} added, ${fresh.copied.length} copied, ${fresh.unchanged.length} unchanged${fresh.removed.length ? `, ${fresh.removed.length} replaced` : ""}; ${fresh.reportsAdded + fresh.reportsCopied} service report${fresh.reportsAdded + fresh.reportsCopied === 1 ? "" : "s"} imported.`,
                      }
                    : { text: "Import failed (storage full or unavailable). Nothing on this device was changed.", error: true },
                );
                reset();
              }}
            >
              {mode === "merge" ? "Import (merge)" : "Replace data"}
            </button>
            <button type="button" className={button} onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
