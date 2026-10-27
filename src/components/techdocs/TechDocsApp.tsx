"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useUrlSearch } from "@/lib/eol/use-url-selection";
import { downloadTechWorkbook } from "@/lib/techdocs/download";
import { createRegister, duplicateRegister, registerTitle } from "@/lib/techdocs/register";
import type { TechRegister } from "@/lib/techdocs/schema";
import { deleteRegister, parseRegisters, readRegistersRaw, saveRegister, subscribeRegisters } from "@/lib/techdocs/store";
import { defaultTechnician, RegisterEditor } from "./RegisterEditor";

/** Registers home (create, reopen, manage) and the editor, switched by `?id=` so Back works on phones. */
export function TechDocsApp() {
  const { search, setSearch } = useUrlSearch();
  const id = new URLSearchParams(search).get("id");
  const raw = useSyncExternalStore(subscribeRegisters, () => readRegistersRaw() ?? "", () => "");
  const { registers, skipped } = useMemo(() => parseRegisters(raw || null), [raw]);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (id) return <RegisterEditor key={id} id={id} onClose={() => setSearch("", "push")} />;

  const open = (r: TechRegister) => setSearch(`?id=${encodeURIComponent(r.id)}`, "push");
  const create = () => {
    const r = createRegister(defaultTechnician());
    saveRegister(r);
    open(r);
  };

  return (
    <div className="flex flex-col gap-5">
      <button type="button" onClick={create} className="h-14 rounded-2xl bg-signal-500 px-5 text-[15px] font-semibold text-ink-950 hover:bg-signal-400 sm:self-start">
        + New technical register
      </button>

      <p className="rounded-xl border border-unverified/30 bg-unverified/[0.05] px-4 py-3 text-sm leading-relaxed text-fg" role="note" data-testid="storage-warning">
        <span className="font-semibold text-unverified">Saved in this browser only.</span> Registers stay on this device and aren&apos;t backed up or sent anywhere. They can hold
        sensitive site configuration — export to Excel to keep a copy, and don&apos;t record passwords or access codes.
      </p>

      <section aria-labelledby="registers-heading" className="flex flex-col gap-2">
        <h2 id="registers-heading" className="text-[15px] font-semibold text-fg">
          Your registers ({registers.length})
        </h2>
        {skipped > 0 && (
          <p className="text-sm text-amber-300" role="status">
            {skipped} saved register{skipped === 1 ? "" : "s"} couldn&apos;t be read (damaged or from an older version) and {skipped === 1 ? "is" : "are"} not shown.
          </p>
        )}
        {message && (
          <p className="text-sm text-fg-muted" role="status">
            {message}
          </p>
        )}
        {registers.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-fg-muted">
            No registers yet. Create one per site to record equipment, firmware, network settings and access requirements.
          </p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Saved registers">
            {registers.map((r) => (
              <li key={r.id} className="rounded-2xl border border-line bg-ink-900 p-3" data-register={r.id}>
                <button type="button" onClick={() => open(r)} className="block min-h-11 w-full text-left">
                  <span className="block text-[15px] font-semibold text-fg">{registerTitle(r)}</span>
                  <span className="block text-xs text-fg-muted">
                    {[r.name && r.siteName, r.customer, r.siteReference].filter(Boolean).join(" · ")}
                    {r.name && r.siteName ? " · " : r.customer || r.siteReference ? " · " : ""}
                    {r.equipment.length} entr{r.equipment.length === 1 ? "y" : "ies"} · updated {new Date(r.updatedAt).toLocaleDateString("en-AU")}
                  </span>
                </button>
                {confirmDelete === r.id ? (
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-fg" role="alert">
                    Delete {registerTitle(r)} and its {r.equipment.length} entr{r.equipment.length === 1 ? "y" : "ies"} from this device? This can&apos;t be undone.
                    <button
                      type="button"
                      onClick={() => {
                        deleteRegister(r.id);
                        setConfirmDelete(null);
                      }}
                      className="h-10 rounded-lg border border-fault/50 px-3 font-medium text-fault hover:bg-fault/10"
                    >
                      Delete register
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(null)} className="h-10 rounded-lg border border-line-strong px-3 font-medium text-fg hover:bg-ink-800">
                      Cancel
                    </button>
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => open(r)} className="h-10 rounded-lg bg-signal-500 px-3 text-sm font-semibold text-ink-950 hover:bg-signal-400">
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          setMessage(`Downloaded ${await downloadTechWorkbook(r)}`);
                        } catch {
                          setMessage("Couldn't create the Excel file. Try again.");
                        }
                      }}
                      className="h-10 rounded-lg border border-line-strong px-3 text-sm font-medium text-fg hover:bg-ink-800"
                    >
                      Excel
                    </button>
                    <button type="button" onClick={() => saveRegister(duplicateRegister(r))} className="h-10 rounded-lg border border-line-strong px-3 text-sm font-medium text-fg hover:bg-ink-800">
                      Duplicate
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(r.id)} className="h-10 rounded-lg px-3 text-sm font-medium text-fg-muted hover:text-fault">
                      Delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
