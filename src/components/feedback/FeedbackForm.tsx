"use client";

import { useState } from "react";
import { APP_VERSION } from "@/lib/config";
import { EMPTY_FEEDBACK, FEEDBACK_TYPES, SEVERITIES, feedbackFileName, feedbackRecipient, feedbackText, isEmpty, mailtoUrl, sensitiveHints, type Feedback } from "@/lib/feedback";

const field = "min-h-11 w-full rounded-lg border border-line-strong bg-ink-850 px-3 py-2.5 text-[15px] text-fg placeholder:text-fg-subtle focus:border-signal-400 focus:outline-none";
const label = "text-sm font-medium text-fg";
const button = "h-11 rounded-lg border border-line-strong px-3 text-sm font-medium text-fg hover:bg-ink-800 disabled:opacity-50";
const primary = "h-11 rounded-lg bg-signal-500 px-4 text-sm font-semibold text-ink-950 hover:bg-signal-400 disabled:opacity-50";

const TEXTS: { key: keyof Feedback; label: string; hint: string; rows: number }[] = [
  { key: "description", label: "What happened?", hint: "Describe the problem or suggestion.", rows: 4 },
  { key: "steps", label: "Steps to reproduce", hint: "1. Opened … 2. Tapped …", rows: 3 },
  { key: "expected", label: "What did you expect?", hint: "", rows: 2 },
  { key: "actual", label: "What happened instead?", hint: "", rows: 2 },
];

export function FeedbackForm() {
  const [f, setF] = useState<Feedback>(EMPTY_FEEDBACK);
  const [status, setStatus] = useState("");
  const set = (patch: Partial<Feedback>) => {
    setF({ ...f, ...patch });
    setStatus("");
  };
  const recipient = feedbackRecipient();
  const text = feedbackText(f, APP_VERSION);
  const hints = sensitiveHints(Object.values(f).join("\n"));
  const empty = isEmpty(f);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied to the clipboard. Nothing has been sent — paste it into a message to the pilot coordinator.");
    } catch {
      setStatus("Couldn't copy automatically. Select the text in the preview below and copy it, or download it as a file.");
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = feedbackFileName(f);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`Downloaded ${a.download}. Nothing has been sent — pass the file to the pilot coordinator.`);
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => e.preventDefault()} aria-describedby="feedback-privacy">
      <p id="feedback-privacy" className="rounded-xl border border-line bg-ink-900 px-4 py-3 text-sm leading-relaxed text-fg" role="note">
        <span className="font-semibold">Nothing is sent automatically.</span> Fieldwise doesn&apos;t collect your records, site details, screenshots or device information.
        Only what you type here goes into the feedback, and you choose how to pass it on. Please leave out customer names, addresses, IP addresses, passwords and codes.
      </p>

      <fieldset className="flex flex-col gap-2">
        <legend className={`${label} mb-2`}>Type of feedback</legend>
        <div className="flex flex-wrap gap-2">
          {FEEDBACK_TYPES.map((t) => (
            <label key={t.id} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${f.type === t.id ? "border-signal-400 bg-signal-500/10 text-fg" : "border-line-strong text-fg-muted"}`}>
              <input type="radio" name="type" value={t.id} checked={f.type === t.id} onChange={() => set({ type: t.id })} className="accent-signal-500" />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={label}>Feature or page (optional)</span>
          <input className={field} value={f.page} maxLength={200} placeholder="e.g. EOL Wiring Assistant" onChange={(e) => set({ page: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>Severity (optional)</span>
          <select className={field} value={f.severity} onChange={(e) => set({ severity: e.target.value as Feedback["severity"] })}>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s || "Not set"}
              </option>
            ))}
          </select>
        </label>
      </div>

      {TEXTS.map((t) => (
        <label key={t.key} className="flex flex-col gap-1.5">
          <span className={label}>
            {t.label} <span className="font-normal text-fg-muted">(optional)</span>
          </span>
          <textarea className={field} rows={t.rows} maxLength={5000} placeholder={t.hint} value={f[t.key]} onChange={(e) => set({ [t.key]: e.target.value })} />
        </label>
      ))}

      {hints.length > 0 && (
        <p className="rounded-lg border border-unverified/40 bg-unverified/[0.06] px-3 py-2 text-sm text-fg" role="status" data-testid="sensitive-hint">
          This looks like it may include {hints.join(", ")}. Remove anything you don&apos;t want to share before passing it on.
        </p>
      )}

      <section aria-label="Feedback preview" className="flex flex-col gap-1.5">
        <h2 className={label}>Preview (version {APP_VERSION} is included)</h2>
        <pre className="max-h-64 overflow-auto rounded-lg border border-line bg-ink-900 px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap text-fg-muted" data-testid="feedback-preview">
          {text}
        </pre>
      </section>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={primary} disabled={empty} onClick={copy}>
          Copy feedback
        </button>
        <button type="button" className={button} disabled={empty} onClick={download}>
          Download as a file
        </button>
        {recipient && !empty && (
          <a
            className={`${button} inline-flex items-center`}
            href={mailtoUrl(recipient, f, APP_VERSION)}
            onClick={() => setStatus("Your email app should open with a draft. Nothing is sent until you send it from there.")}
          >
            Open as email draft
          </a>
        )}
        <button
          type="button"
          className="h-11 px-2 text-sm font-medium text-fg-muted hover:text-fg"
          onClick={() => {
            setF(EMPTY_FEEDBACK);
            setStatus("Cleared.");
          }}
        >
          Clear
        </button>
      </div>
      {empty && <p className="text-sm text-fg-muted">Fill in at least one field to copy or download feedback.</p>}
      {!recipient && <p className="text-sm text-fg-muted">No feedback email address is set up for this build — copy or download the feedback and pass it on the way your pilot coordinator asked.</p>}
      <p className="text-sm font-medium text-fg" role="status" data-testid="feedback-status">
        {status || "Nothing has been sent."}
      </p>
    </form>
  );
}
