"use client";

import Link from "next/link";

/** Shown if a page fails unexpectedly. Never shows technical details; records stay in this browser. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-2xl border border-line bg-ink-900 p-5" role="alert">
      <h1 className="text-lg font-semibold text-fg">Something went wrong</h1>
      <p className="mt-1 text-sm leading-relaxed text-fg-muted">
        This page couldn&apos;t be shown. Your saved records are still in this browser. Try again, or go back to the dashboard. If it keeps happening, please send
        feedback describing what you were doing.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={reset} className="h-11 rounded-lg bg-signal-500 px-4 text-sm font-semibold text-ink-950 hover:bg-signal-400">
          Try again
        </button>
        <Link href="/" className="inline-flex h-11 items-center rounded-lg border border-line-strong px-3 text-sm font-medium text-fg hover:bg-ink-800">
          Dashboard
        </Link>
        <Link href="/feedback" className="inline-flex h-11 items-center rounded-lg border border-line-strong px-3 text-sm font-medium text-fg hover:bg-ink-800">
          Send feedback
        </Link>
      </div>
    </div>
  );
}
