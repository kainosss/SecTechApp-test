"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/Icon";
import { enterDemo, exitDemo, resetDemo } from "@/lib/demo/workspace";
import { subscribeWorkspace, workspaceSnapshot } from "@/lib/workspace";

const button = "h-11 rounded-lg border border-example/40 px-3 text-sm font-medium text-fg hover:bg-example/10";

export function useDemoWorkspace(): boolean {
  return useSyncExternalStore(subscribeWorkspace, workspaceSnapshot, () => "real") === "demo";
}

/** Shown on every page while the demo workspace is active, so fictional records are never mistaken for real ones. */
export function DemoWorkspaceBanner() {
  const demo = useDemoWorkspace();
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState("");
  if (!demo) return null;
  return (
    <div role="region" aria-label="Demo workspace" className="border-b border-example/40 bg-example/[0.10] px-4 py-2 text-sm text-fg sm:px-6 lg:px-10" data-testid="demo-banner">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
        <p className="flex min-w-0 basis-full items-start gap-2 sm:flex-1 sm:basis-auto">
          <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-example" />
          <span>
            <span className="font-semibold text-example">Demo workspace</span> — fictional records. Your own records are hidden, not changed.
          </span>
          {message && <span className="ml-1 text-fg-muted" role="status">{message}</span>}
        </p>
        {confirm ? (
          <>
            <span className="text-fg-muted">Discard all changes made in the demo?</span>
            <button
              type="button"
              className={button}
              onClick={() => {
                setConfirm(false);
                setMessage(resetDemo() ? "Demo reset." : "The demo couldn't be reset (browser storage unavailable or full).");
              }}
            >
              Reset demo
            </button>
            <button type="button" className={button} onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button type="button" className={button} onClick={() => setConfirm(true)}>
              Reset demo…
            </button>
            <Link href="/" className={`${button} inline-flex items-center`} onClick={exitDemo}>
              Exit demo
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

/** Explicit entry point; opens the demo site in Technical Docs. */
export function EnterDemoButton({ className = button, label = "Explore the demo site", onEnter }: { className?: string; label?: string; onEnter?: () => void }) {
  const [error, setError] = useState("");
  return (
    <>
      <Link
        href="/tech-docs"
        className={`${className} inline-flex items-center`}
        onClick={(e) => {
          if (!enterDemo()) {
            e.preventDefault();
            return setError("The demo couldn't be opened: browser storage is unavailable or full.");
          }
          onEnter?.();
        }}
      >
        {label}
      </Link>
      {error && <span className="text-sm text-fault" role="alert">{error}</span>}
    </>
  );
}

/** A quiet invitation to try the demo site; hidden while the demo is open. */
export function DemoInvite() {
  if (useDemoWorkspace()) return null;
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-fg-muted" data-testid="demo-invite">
      <span className="min-w-0 flex-1">Want to look around first? The demo site is fictional and kept separate from your records.</span>
      <EnterDemoButton />
    </p>
  );
}
