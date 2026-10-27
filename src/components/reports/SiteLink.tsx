"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { type ReportEdit } from "@/lib/reports/report";
import type { Report, ReportItem } from "@/lib/reports/schema";
import { linkedEquipmentIds, linkedItem, proposedChanges, sitePopulation, snapshotDifferences, UPDATABLE_FIELDS } from "@/lib/sites/link";
import { FIELD_LABEL, SECTIONS } from "@/lib/techdocs/fields";
import { CATEGORY_LABEL, equipmentLabel, filterEquipment, registerTitle } from "@/lib/techdocs/register";
import type { EquipmentTextField, HistoryChange, TechRegister } from "@/lib/techdocs/schema";
import { Field, inputClass } from "./EquipmentCard";

const button = "h-11 rounded-lg border border-line-strong px-3 text-sm font-medium text-fg hover:bg-ink-800";
const primary = "h-11 rounded-lg bg-signal-500 px-4 text-sm font-semibold text-ink-950 hover:bg-signal-400 disabled:opacity-50";

/** Optional link from a report to a Technical Docs site register. */
export function SiteLinkCard({
  report,
  registers,
  site,
  onLink,
  onUnlink,
  onPick,
}: {
  report: Report;
  registers: TechRegister[];
  site: TechRegister | null;
  onLink: (register: TechRegister, replace: boolean) => void;
  onUnlink: () => void;
  onPick: () => void;
}) {
  const [choice, setChoice] = useState("");
  const [pending, setPending] = useState<TechRegister | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  if (!report.registerId) {
    if (registers.length === 0) {
      return (
        <p className="rounded-xl border border-line px-4 py-3 text-sm text-fg-muted" data-testid="site-link">
          Standalone report. To pick documented equipment, create a site register in{" "}
          <Link href="/tech-docs" className="font-semibold text-signal-400">
            Technical Docs
          </Link>
          .
        </p>
      );
    }
    const conflicts = pending ? sitePopulation(report, pending).conflicts : [];
    return (
      <section aria-label="Site register" className="rounded-2xl border border-line bg-ink-900 p-4" data-testid="site-link">
        <h2 className="text-[15px] font-semibold text-fg">Site register (optional)</h2>
        <p className="mt-1 text-xs text-fg-muted">Link a Technical Docs site to fill in site details and pick its documented equipment.</p>
        {pending ? (
          <div className="mt-3 rounded-xl border border-amber-300/40 bg-amber-300/[0.06] p-3 text-sm text-fg" role="alert">
            <p className="font-semibold">This report already has different site details:</p>
            <ul className="mt-2 flex flex-col gap-1">
              {conflicts.map((c) => (
                <li key={c.field}>
                  <span className="text-fg-muted">{c.label}:</span> “{c.current}” → “{c.incoming}”
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={primary} onClick={() => (onLink(pending, false), setPending(null))}>
                Link, keep report details
              </button>
              <button type="button" className={button} onClick={() => (onLink(pending, true), setPending(null))}>
                Link and replace
              </button>
              <button type="button" className="h-11 px-3 text-sm text-fg-muted hover:text-fg" onClick={() => setPending(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex gap-2">
            <select aria-label="Site register" className={inputClass} value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">Choose a site…</option>
              {registers.map((r) => (
                <option key={r.id} value={r.id}>
                  {registerTitle(r)} ({r.equipment.length})
                </option>
              ))}
            </select>
            <button
              type="button"
              className={primary}
              disabled={!choice}
              onClick={() => {
                const r = registers.find((x) => x.id === choice);
                if (!r) return;
                if (sitePopulation(report, r).conflicts.length) setPending(r);
                else onLink(r, false);
              }}
            >
              Link
            </button>
          </div>
        )}
      </section>
    );
  }

  const inReport = report.equipment.filter((i) => i.source?.registerId === report.registerId).length;
  return (
    <section aria-label="Site register" className="rounded-2xl border border-signal-400/40 bg-ink-900 p-4" data-testid="site-link">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-signal-400 uppercase">Linked site</p>
          {site ? (
            <p className="text-[15px] font-semibold text-fg">
              {registerTitle(site)}{" "}
              <span className="text-xs font-normal text-fg-muted">
                · {site.equipment.length} documented · {inReport} in this report
              </span>
            </p>
          ) : (
            <p className="text-sm text-amber-300" role="status">
              The linked site register isn&apos;t on this device (deleted, or saved elsewhere). Equipment keeps the details recorded in this report.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {site && (
            <button type="button" className={primary} onClick={onPick}>
              + Add site equipment
            </button>
          )}
          <button type="button" className="h-11 px-2 text-sm font-medium text-fg-muted hover:text-fault" onClick={() => setConfirmUnlink(true)}>
            Unlink
          </button>
        </div>
      </div>
      {confirmUnlink && (
        <p className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm text-fg" role="alert">
          Unlink this report? Equipment stays in the report with its recorded details; this job&apos;s service entries are removed from the site&apos;s equipment history.
          <button type="button" className="h-10 rounded-lg border border-fault/50 px-3 font-medium text-fault hover:bg-fault/10" onClick={() => (onUnlink(), setConfirmUnlink(false))}>
            Unlink
          </button>
          <button type="button" className="h-10 rounded-lg border border-line-strong px-3 font-medium text-fg hover:bg-ink-800" onClick={() => setConfirmUnlink(false)}>
            Cancel
          </button>
        </p>
      )}
    </section>
  );
}

/** Multi-select picker for a linked site's equipment; entries already in the report can't be added twice. */
export function EquipmentPicker({ report, site, onAdd, onClose }: { report: Report; site: TechRegister; onAdd: (items: ReportItem[]) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const added = useMemo(() => linkedEquipmentIds(report, site.id), [report, site.id]);
  const shown = filterEquipment(site, { query });
  const selectable = shown.filter((e) => !added.has(e.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <section aria-label="Add site equipment" className="mt-3 rounded-2xl border border-signal-400/50 bg-ink-850 p-3" data-testid="equipment-picker">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-fg">Add equipment from {registerTitle(site)}</h3>
        <span className="text-xs text-fg-muted">{selected.size} selected</span>
      </div>
      <input type="search" aria-label="Search site equipment" className={`${inputClass} mt-2`} placeholder="Name, ref, location, make, model or IP" value={query} onChange={(e) => setQuery(e.target.value)} />
      <ul className="mt-2 flex max-h-[50vh] flex-col divide-y divide-line overflow-y-auto rounded-xl border border-line" aria-label="Site equipment">
        {shown.length === 0 && <li className="px-3 py-4 text-center text-sm text-fg-muted">No equipment matches.</li>}
        {shown.map((e) => {
          const inReport = added.has(e.id);
          return (
            <li key={e.id}>
              <label className={`flex min-h-12 items-center gap-3 px-3 py-2 ${inReport ? "opacity-60" : "cursor-pointer hover:bg-ink-800"}`}>
                <input type="checkbox" aria-label={equipmentLabel(site, e)} className="size-5 shrink-0 accent-signal-500" checked={inReport || selected.has(e.id)} disabled={inReport} onChange={() => toggle(e.id)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-fg">{equipmentLabel(site, e)}</span>
                  <span className="block truncate text-xs text-fg-muted">
                    {[e.assetId, e.type || CATEGORY_LABEL[e.category], e.location, [e.make, e.model].filter(Boolean).join(" "), e.ip].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {inReport && <span className="shrink-0 text-xs font-medium text-verified">In report</span>}
              </label>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={primary} disabled={selected.size === 0} onClick={() => onAdd(site.equipment.filter((e) => selected.has(e.id) && !added.has(e.id)).map((e) => linkedItem(site, e)))}>
          Add {selected.size || ""} selected
        </button>
        <button type="button" className={button} disabled={selectable.length === 0} onClick={() => setSelected((s) => new Set([...s, ...selectable.map((e) => e.id)]))}>
          Select all shown ({selectable.length})
        </button>
        <button type="button" className="ml-auto h-11 px-3 text-sm text-fg-muted hover:text-fg" onClick={onClose}>
          Close
        </button>
      </div>
    </section>
  );
}

const GROUPS = SECTIONS.filter((s) => s.fields.some((f) => UPDATABLE_FIELDS.includes(f.key as EquipmentTextField))).map((s) => ({
  title: s.title,
  fields: s.fields.map((f) => f.key).filter((k): k is EquipmentTextField => UPDATABLE_FIELDS.includes(k as EquipmentTextField)),
}));

/** Site equipment details (from the register), the job's history outcome and proposed master-record updates. */
export function LinkedItemPanel({
  item,
  site,
  edit,
  onApply,
}: {
  item: ReportItem;
  site: TechRegister | null;
  edit: (e: ReportEdit) => void;
  onApply: (changes: HistoryChange[]) => { applied: HistoryChange[]; conflicts: HistoryChange[] };
}) {
  const src = item.source!;
  const master = site?.equipment.find((e) => e.id === src.equipmentId) ?? null;
  const [proposing, setProposing] = useState(false);
  const [proposed, setProposed] = useState<Partial<Record<EquipmentTextField, string>>>({});
  const [review, setReview] = useState<{ changes: HistoryChange[]; chosen: Set<string> } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const diffs = site ? snapshotDifferences(site, item) : [];
  const snap = src.snapshot;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-signal-400/30 bg-signal-500/[0.04] p-3" data-testid="linked-item">
      <div>
        <p className="text-xs font-semibold tracking-wide text-signal-400 uppercase">Site equipment details</p>
        <p className="mt-1 text-sm text-fg">{[snap.assetId, snap.category, [snap.make, snap.model].filter(Boolean).join(" "), snap.serial && `S/N ${snap.serial}`, snap.firmware && `FW ${snap.firmware}`].filter(Boolean).join(" · ")}</p>
        <p className="text-xs text-fg-subtle">As recorded for this job{snap.capturedAt ? ` (${new Date(snap.capturedAt).toLocaleDateString("en-AU")})` : ""}. The site register stays the master record.</p>
        {!master && <p className="mt-1 text-xs text-amber-300">This entry is no longer in the site register.</p>}
        {diffs.length > 0 && (
          <p className="mt-1 text-xs text-fg-muted" data-testid="snapshot-diff">
            Site record now: {diffs.map((d) => `${d.label} ${d.now || "(blank)"}`).join(" · ")}
          </p>
        )}
      </div>

      <Field label="Equipment history entry for this job">
        <select className={inputClass} value={src.outcome} onChange={(e) => edit({ type: "update-item", id: item.id, patch: { source: { ...src, outcome: e.target.value as typeof src.outcome } } })}>
          <option value="">Service record only</option>
          <option value="repaired">Repair completed</option>
          <option value="replaced">Equipment replaced</option>
        </select>
      </Field>

      {src.applied.length > 0 && (
        <div className="text-xs text-fg-muted" data-testid="applied-updates">
          <p className="font-semibold text-fg">Applied to the site record during this job</p>
          <ul>
            {src.applied.map((c, i) => (
              <li key={i}>
                {c.label}: {c.from || "(blank)"} → {c.to}
              </li>
            ))}
          </ul>
        </div>
      )}
      {result && (
        <p className="text-sm text-verified" role="status">
          {result}
        </p>
      )}

      {master && !proposing && (
        <button type="button" className={`${button} self-start`} onClick={() => (setProposing(true), setResult(null))}>
          Propose equipment update…
        </button>
      )}

      {master && proposing && !review && (
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-ink-900 p-3" data-testid="propose-update">
          <p className="text-sm font-semibold text-fg">Proposed equipment updates</p>
          <p className="text-xs text-fg-muted">Enter only what changed (e.g. a replacement&apos;s serial number). Nothing changes in the site register until you review and apply.</p>
          {GROUPS.map((g) => (
            <details key={g.title} className="rounded-lg border border-line px-3 py-1" open={g.title === "Hardware"}>
              <summary className="min-h-10 cursor-pointer py-2 text-sm font-medium text-fg">{g.title}</summary>
              <div className="grid gap-2 pb-2 sm:grid-cols-2">
                {g.fields.map((k) => (
                  <Field key={k} label={`${FIELD_LABEL[k]} — now: ${master[k] || "blank"}`}>
                    <input className={inputClass} value={proposed[k] ?? ""} placeholder="New value" onChange={(e) => setProposed({ ...proposed, [k]: e.target.value })} />
                  </Field>
                ))}
              </div>
            </details>
          ))}
          <div className="flex flex-wrap gap-2">
            {(() => {
              const changes = proposedChanges(master, proposed);
              return (
                <button type="button" className={primary} disabled={!changes.length} onClick={() => setReview({ changes, chosen: new Set(changes.map((c) => c.field)) })}>
                  Review {changes.length || ""} change{changes.length === 1 ? "" : "s"}
                </button>
              );
            })()}
            <button type="button" className="h-11 px-3 text-sm text-fg-muted hover:text-fg" onClick={() => (setProposing(false), setProposed({}))}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {master && review && (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-300/40 bg-ink-900 p-3" role="alert" data-testid="review-update">
          <p className="text-sm font-semibold text-fg">Apply to the site register?</p>
          <p className="text-xs text-fg-muted">Only ticked fields change. All other equipment details stay as they are.</p>
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-fg-muted">
              <tr>
                <th className="py-1 pr-2 font-medium">Apply</th>
                <th className="py-1 pr-2 font-medium">Field</th>
                <th className="py-1 pr-2 font-medium">Original</th>
                <th className="py-1 font-medium">Proposed</th>
              </tr>
            </thead>
            <tbody>
              {review.changes.map((c) => (
                <tr key={c.field} className="border-t border-line align-top">
                  <td className="py-2 pr-2">
                    <input
                      type="checkbox"
                      aria-label={`Apply ${c.label}`}
                      className="size-5 accent-signal-500"
                      checked={review.chosen.has(c.field)}
                      onChange={() => {
                        const chosen = new Set(review.chosen);
                        if (chosen.has(c.field)) chosen.delete(c.field);
                        else chosen.add(c.field);
                        setReview({ ...review, chosen });
                      }}
                    />
                  </td>
                  <td className="py-2 pr-2 text-fg">{c.label}</td>
                  <td className="py-2 pr-2 break-all text-fg-muted">{c.from || "(blank)"}</td>
                  <td className="py-2 break-all text-fg">{c.to}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={primary}
              disabled={review.chosen.size === 0}
              onClick={() => {
                const res = onApply(review.changes.filter((c) => review.chosen.has(c.field)));
                const at = new Date().toISOString();
                if (res.applied.length) edit({ type: "update-item", id: item.id, patch: { source: { ...src, applied: [...src.applied, ...res.applied.map((c) => ({ ...c, at }))] } } });
                setResult(
                  [
                    res.applied.length ? `Site register updated: ${res.applied.map((c) => c.label).join(", ")}.` : "",
                    res.conflicts.length ? `Not applied (changed in the register since you started): ${res.conflicts.map((c) => c.label).join(", ")}.` : "",
                  ]
                    .filter(Boolean)
                    .join(" "),
                );
                setReview(null);
                setProposing(false);
                setProposed({});
              }}
            >
              Apply {review.chosen.size} change{review.chosen.size === 1 ? "" : "s"}
            </button>
            <button type="button" className={button} onClick={() => setReview(null)}>
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
