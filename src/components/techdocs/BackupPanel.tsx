"use client";

import { useRef, useState } from "react";
import { loadReports } from "@/lib/reports/store";
import { backupFileName, createBackup, MAX_BACKUP_BYTES, parseBackup, planImport, summarise, type Backup, type ImportMode } from "@/lib/techdocs/backup";
import type { TechRegister } from "@/lib/techdocs/schema";
import { commitImport, loadRegisters } from "@/lib/techdocs/store";

const button = "h-11 rounded-lg border border-line-strong px-3 text-sm font-medium text-fg hover:bg-ink-800 disabled:opacity-50";
const primary = "h-11 rounded-lg bg-signal-500 px-4 text-sm font-semibold text-ink-950 hover:bg-signal-400 disabled:opacity-50";

function download(registers: TechRegister[]): string {
  const name = backupFileName();
  const blob = new Blob([JSON.stringify(createBackup(registers, loadReports().reports), null, 1)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return name;
}

const list = (titles: string[]) => (titles.length > 6 ? `${titles.slice(0, 6).join(", ")} and ${titles.length - 6} more` : titles.join(", "));

/** Manual backup to a file and restore from one, with a preview and an explicit merge or replace. */
export function BackupPanel({ registers }: { registers: TechRegister[] }) {
  const input = useRef<HTMLInputElement>(null);
  const [backup, setBackup] = useState<Backup | null>(null);
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState<ImportMode>("merge");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const reset = () => {
    setBackup(null);
    setConfirmReplace(false);
    setMode("merge");
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

  const existing = { registers: loadRegisters().registers, reports: loadReports().reports };
  const plan = backup ? planImport(backup, existing, mode) : null;
  const summary = backup ? summarise(backup) : null;

  return (
    <section aria-labelledby="backup-heading" className="rounded-2xl border border-line bg-ink-900 p-4" data-testid="backup">
      <h2 id="backup-heading" className="text-[15px] font-semibold text-fg">
        Backup &amp; restore
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-fg-muted">
        Browser storage is <strong className="text-fg">not a cloud backup</strong> — registers can be lost if browser data is cleared or the device is replaced. Download a
        backup file regularly and keep it somewhere safe. It contains site configuration (and linked service reports), so store it securely. Nothing is uploaded.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={primary} disabled={registers.length === 0} onClick={() => setMessage({ text: `Downloaded ${download(registers)}` })}>
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
              Saved {new Date(summary.exportedAt).toLocaleString("en-AU")} · {summary.registers} register{summary.registers === 1 ? "" : "s"} · {summary.equipment} equipment entries ·{" "}
              {summary.historyEvents} history events · {summary.reports} linked service report{summary.reports === 1 ? "" : "s"}
            </p>
            {summary.titles.length > 0 && <p className="text-fg-muted">Registers: {list(summary.titles)}</p>}
          </div>

          <div role="radiogroup" aria-label="Import method" className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["merge", "Merge", "Add what's new. Nothing on this device is changed or deleted."],
                ["replace", "Replace registers", "Delete the registers on this device and use the backup's instead."],
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

          <ul className="flex flex-col gap-1 text-fg-muted" aria-label="What will happen">
            {plan.added.length > 0 && <li>Add: {list(plan.added)}</li>}
            {plan.unchanged.length > 0 && <li>Already on this device (skipped): {list(plan.unchanged)}</li>}
            {plan.copied.length > 0 && <li>Different version already here — imported as a separate copy: {list(plan.copied)}</li>}
            {plan.removed.length > 0 && <li className="text-fault">Delete from this device: {list(plan.removed)}</li>}
            {plan.reportsAdded + plan.reportsCopied > 0 && (
              <li>
                Service reports: {plan.reportsAdded} added{plan.reportsCopied ? `, ${plan.reportsCopied} imported as copies (existing reports are never overwritten)` : ""}
              </li>
            )}
            {plan.orphanedReports > 0 && (
              <li className="text-amber-300">
                {plan.orphanedReports} service report{plan.orphanedReports === 1 ? "" : "s"} on this device will lose {plan.orphanedReports === 1 ? "its" : "their"} linked register (recorded details are kept).
              </li>
            )}
            {plan.added.length + plan.copied.length + plan.reportsAdded + plan.reportsCopied === 0 && plan.removed.length === 0 && <li>Nothing new to import.</li>}
          </ul>

          {mode === "replace" && plan.removed.length > 0 && (
            <label className="flex items-start gap-2 rounded-lg border border-fault/40 p-2">
              <input type="checkbox" className="mt-0.5 size-5 accent-signal-500" checked={confirmReplace} onChange={(e) => setConfirmReplace(e.target.checked)} />
              <span>
                I understand {plan.removed.length} register{plan.removed.length === 1 ? "" : "s"} on this device will be deleted. (Download a backup of them first if you may need them.)
              </span>
            </label>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={primary}
              disabled={mode === "replace" && plan.removed.length > 0 && !confirmReplace}
              onClick={() => {
                // Re-plan against current storage at the moment of import, then write both lists (rolled back together on failure).
                const fresh = planImport(backup, { registers: loadRegisters().registers, reports: loadReports().reports }, mode);
                const ok = commitImport(fresh.registers, fresh.reports);
                setMessage(
                  ok
                    ? { text: `Import complete: ${fresh.added.length} added, ${fresh.copied.length} copied, ${fresh.unchanged.length} unchanged${fresh.removed.length ? `, ${fresh.removed.length} replaced` : ""}.` }
                    : { text: "Import failed (storage full or unavailable). Nothing on this device was changed.", error: true },
                );
                reset();
              }}
            >
              {mode === "merge" ? "Import (merge)" : "Replace registers"}
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
