"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { EMPTY_BRANDING, isBranded, loadBranding, readLogo, saveBranding, type Branding } from "@/lib/handover/branding";
import { availableSections, DEFAULT_OPTIONS, SECTION_OPTIONS, type HandoverOptions } from "@/lib/handover/content";
import { generateHandover, handoverFileName, type Handover } from "@/lib/handover/pdf";
import type { Report } from "@/lib/reports/schema";
import { areaClass, Field, inputClass } from "./EquipmentCard";
import { PreviewFontStyle, PreviewPage } from "./HandoverPreview";

const button = "h-11 rounded-lg border border-line-strong px-3 text-sm font-medium text-fg hover:bg-ink-800 disabled:opacity-50";
const primary = "h-12 rounded-xl bg-signal-500 px-5 text-[15px] font-semibold text-ink-950 hover:bg-signal-400 disabled:opacity-50";

type State = { status: "loading" } | { status: "ready"; handover: Handover } | { status: "error"; message: string };

/** Review, preview and export a customer-facing PDF of the service report. */
export function HandoverPanel({ report, onClose }: { report: Report; onClose: () => void }) {
  const [options, setOptions] = useState<HandoverOptions>(DEFAULT_OPTIONS);
  const [branding, setBranding] = useState<Branding>(() => (typeof window === "undefined" ? EMPTY_BRANDING : loadBranding()));
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<"pages" | "pdf">("pages");
  const [message, setMessage] = useState<string | null>(null);
  const available = availableSections(report);

  // One generation produces both the preview pages and the PDF bytes; it re-runs (debounced) when anything changes.
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      setState((s) => (s.status === "ready" ? s : { status: "loading" }));
      generateHandover(report, options, branding)
        .then((handover) => live && setState({ status: "ready", handover }))
        .catch(() => live && setState({ status: "error", message: "The PDF couldn't be prepared. Your report is unchanged — try again." }));
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [report, options, branding, attempt]);

  const handover = state.status === "ready" ? state.handover : null;
  const url = useMemo(() => (handover && typeof URL.createObjectURL === "function" ? URL.createObjectURL(new Blob([handover.bytes], { type: "application/pdf" })) : null), [handover]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  const canEmbed = typeof navigator !== "undefined" && (navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled === true;

  function download() {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = handoverFileName(report);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setMessage(`Downloaded ${a.download}`);
  }

  return (
    <div className="flex flex-col gap-4 pb-8" data-testid="handover">
      <PreviewFontStyle />
      <button type="button" onClick={onClose} className="-ml-2 inline-flex h-10 items-center gap-1 self-start rounded-lg px-2 text-sm font-medium text-fg-muted hover:bg-ink-850 hover:text-fg">
        <Icon name="chevron-right" className="size-4 rotate-180" />
        Back to report
      </button>
      <header>
        <h2 className="text-lg font-semibold text-fg">Client handover PDF</h2>
        <p className="mt-1 text-sm text-fg-muted">
          A customer-facing service report made from what&apos;s entered in this job — nothing is rewritten or added. Network settings, internal notes and site register details are never
          included. Made on this device; nothing is uploaded.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <section aria-labelledby="include-heading" className="rounded-2xl border border-line bg-ink-900 p-4">
            <h3 id="include-heading" className="text-[15px] font-semibold text-fg">
              Include
            </h3>
            <p className="mt-1 text-xs text-fg-muted">Site and customer details are always included. Empty sections are left out automatically.</p>
            <ul className="mt-2 flex flex-col">
              {SECTION_OPTIONS.map((s) => (
                <li key={s.id}>
                  <label className={`flex min-h-11 items-center gap-3 text-sm ${available[s.id] ? "text-fg" : "text-fg-subtle"}`}>
                    <input
                      type="checkbox"
                      className="size-5 accent-signal-500"
                      checked={options[s.id] && available[s.id]}
                      disabled={!available[s.id]}
                      onChange={(e) => setOptions({ ...options, [s.id]: e.target.checked })}
                    />
                    <span>
                      {s.label}
                      {!available[s.id] && <span className="block text-xs">Nothing entered</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>

          <BrandingEditor branding={branding} onChange={setBranding} />
        </div>

        <section aria-labelledby="preview-heading" className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-ink-900 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="preview-heading" className="text-[15px] font-semibold text-fg">
              Preview{handover ? ` · ${handover.pages.length} page${handover.pages.length === 1 ? "" : "s"}` : ""}
            </h3>
            {canEmbed && handover && (
              <div role="radiogroup" aria-label="Preview type" className="hidden gap-1 lg:flex">
                {(
                  [
                    ["pages", "Pages"],
                    ["pdf", "PDF viewer"],
                  ] as const
                ).map(([id, label]) => (
                  <button key={id} type="button" role="radio" aria-checked={view === id} onClick={() => setView(id)} className={`h-9 rounded-lg px-3 text-sm ${view === id ? "bg-signal-500/15 font-semibold text-signal-300" : "text-fg-muted hover:text-fg"}`}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {handover && handover.unsupported.length > 0 && (
            <p className="rounded-lg border border-amber-300/40 bg-amber-300/[0.06] px-3 py-2 text-sm text-fg" role="note">
              Some characters can&apos;t be shown in the PDF font and appear as “?”: {handover.unsupported.join(" ")}. Edit the report text if they matter.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={primary} disabled={!handover} onClick={download}>
              Download PDF
            </button>
            {url && (
              <a href={url} target="_blank" rel="noopener" className={`${button} inline-flex items-center`}>
                Open PDF
              </a>
            )}
            <span className="text-sm text-fg-muted" role="status" data-testid="handover-status">
              {state.status === "loading" ? "Preparing preview…" : state.status === "error" ? "" : (message ?? "Preview shows the exact pages in the PDF.")}
            </span>
          </div>

          {state.status === "error" && (
            <div className="rounded-lg border border-fault/40 px-3 py-2 text-sm text-fg" role="alert">
              {state.message}{" "}
              <button type="button" className="font-semibold text-signal-400" onClick={() => setAttempt((a) => a + 1)}>
                Try again
              </button>
            </div>
          )}

          {handover && view === "pdf" && url ? (
            <iframe title="PDF preview" src={url} className="h-[80vh] w-full rounded-lg border border-line bg-white" />
          ) : handover ? (
            <div className={`flex flex-col gap-4 rounded-xl bg-ink-850 p-2 sm:p-4 ${state.status === "loading" ? "opacity-60" : ""}`} aria-label="PDF pages" role="list">
              {handover.pages.map((page, i) => (
                <div role="listitem" key={i} className="mx-auto w-full max-w-[640px]">
                  <PreviewPage page={page} index={i} total={handover.pages.length} />
                </div>
              ))}
            </div>
          ) : (
            state.status === "loading" && <div className="h-64 animate-pulse rounded-xl bg-ink-850 motion-reduce:animate-none" aria-hidden="true" />
          )}
        </section>
      </div>
    </div>
  );
}

/** Optional company details and logo, stored on this device and used on every handover. */
function BrandingEditor({ branding, onChange }: { branding: Branding; onChange: (b: Branding) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(branding);
  const file = useRef<HTMLInputElement>(null);
  // Text edits are saved and applied after a short pause, so the preview isn't rebuilt on every keystroke.
  useEffect(() => {
    if (draft === branding) return;
    const t = setTimeout(() => {
      onChange(draft);
      if (!saveBranding(draft)) setError("Couldn't save branding on this device (storage full?). It's still used for this PDF.");
    }, 400);
    return () => clearTimeout(t);
  }, [draft, branding, onChange]);
  const set = (patch: Partial<Branding>) => setDraft({ ...draft, ...patch });

  return (
    <details className="rounded-2xl border border-line bg-ink-900" data-testid="branding">
      <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-2 px-4 py-2 text-[15px] font-semibold text-fg">
        <span>Company branding</span>
        <span className="text-xs font-medium text-fg-muted">{isBranded(draft) ? "On" : "Optional"}</span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-line px-4 py-3">
        <p className="text-xs text-fg-muted">All optional. Leave blank for an unbranded report. Saved on this device and used for every handover.</p>
        <Field label="Company name">
          <input className={inputClass} value={draft.companyName} onChange={(e) => set({ companyName: e.target.value })} maxLength={120} />
        </Field>
        <Field label="Phone">
          <input className={inputClass} value={draft.phone} onChange={(e) => set({ phone: e.target.value })} maxLength={40} inputMode="tel" />
        </Field>
        <Field label="Email">
          <input className={inputClass} value={draft.email} onChange={(e) => set({ email: e.target.value })} maxLength={120} inputMode="email" />
        </Field>
        <Field label="Business address">
          <textarea className={areaClass} rows={2} value={draft.address} onChange={(e) => set({ address: e.target.value })} maxLength={300} />
        </Field>
        <Field label="ABN">
          <input className={inputClass} value={draft.abn} onChange={(e) => set({ abn: e.target.value })} maxLength={30} inputMode="numeric" />
        </Field>
        <div className="flex items-end gap-2">
          <Field label="Accent colour (rules and highlights)">
            <input type="color" className="h-11 w-16 rounded-lg border border-line-strong bg-ink-850" value={draft.accent || "#17324d"} onChange={(e) => set({ accent: e.target.value.toUpperCase() })} />
          </Field>
          {draft.accent && (
            <button type="button" className={button} onClick={() => set({ accent: "" })}>
              Default
            </button>
          )}
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-fg-muted">Logo (PNG or JPEG, up to 512 KB)</p>
          {draft.logo ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
              <img src={draft.logo.dataUrl} alt="Logo preview" className="h-12 max-w-40 rounded bg-white object-contain p-1" />
              <button type="button" className={button} onClick={() => set({ logo: null })}>
                Remove logo
              </button>
            </div>
          ) : (
            <button type="button" className={button} onClick={() => file.current?.click()}>
              Choose logo…
            </button>
          )}
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            aria-label="Logo file"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              const res = await readLogo(f);
              if (!res.ok) return setError(res.error);
              setError(null);
              set({ logo: res.logo });
            }}
          />
        </div>
        {error && (
          <p className="text-sm text-fault" role="alert">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
