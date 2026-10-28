"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { EnterDemoButton } from "@/components/demo/DemoWorkspaceBanner";
import { Icon } from "@/components/ui/Icon";
import { TOOL_GUIDE } from "@/lib/guide";
import { completeWelcome, isWelcomeDone, subscribeOnboarding } from "@/lib/onboarding";

const primary = "h-11 rounded-lg bg-signal-500 px-4 text-sm font-semibold text-ink-950 hover:bg-signal-400";
const secondary = "h-11 rounded-lg border border-line-strong px-3 text-sm font-medium text-fg hover:bg-ink-800";

/**
 * Shown once on the dashboard for a new device. Every action (or "Skip")
 * dismisses it for good; Help can show it again. Rendered only after
 * hydration, so returning technicians never see it flash.
 */
export function WelcomeCard() {
  const show = !useSyncExternalStore(subscribeOnboarding, isWelcomeDone, () => true);
  if (!show) return null;

  const getStarted = () => {
    completeWelcome();
    // On phones, focusing the search would pop up the keyboard over the dashboard.
    if (window.matchMedia?.("(min-width: 1024px)").matches) document.querySelector<HTMLInputElement>("main input[type=search]")?.focus();
  };

  return (
    <section aria-labelledby="welcome-heading" className="rounded-2xl border border-signal-400/40 bg-ink-900 p-4 sm:p-6" data-testid="welcome">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="welcome-heading" className="text-lg font-semibold text-fg">
            Welcome to Fieldwise
          </h2>
          <p className="mt-1 text-[15px] leading-relaxed text-fg-muted">
            A pocket reference and toolkit for electronic security technicians. No account needed — everything stays in this browser.
          </p>
        </div>
        <button type="button" onClick={completeWelcome} className="h-11 shrink-0 rounded-lg px-3 text-sm font-medium text-fg-muted hover:text-fg">
          Skip
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={getStarted} className={primary}>
          Get started
        </button>
        <EnterDemoButton className={secondary} label="Explore the demo site" onEnter={completeWelcome} />
        <Link href="/help" onClick={completeWelcome} className={`${secondary} inline-flex items-center`}>
          How each tool works
        </Link>
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2" aria-label="What each tool does">
        {TOOL_GUIDE.map((t) => (
          <li key={t.href} className="flex gap-3 rounded-xl border border-line bg-ink-850 p-3">
            <Icon name={t.icon} className="mt-0.5 size-5 shrink-0 text-signal-400" />
            <span>
              <span className="block text-sm font-semibold text-fg">{t.title}</span>
              <span className="block text-[13px] leading-snug text-fg-muted">{t.what}</span>
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-[13px] leading-relaxed text-fg-muted">
        Technical content is labelled <span className="font-semibold text-fg">Verified</span>, <span className="font-semibold text-fg">Generic training example</span> or{" "}
        <span className="font-semibold text-fg">Requires verification</span>. Always confirm against the manufacturer&apos;s documentation and the site&apos;s configuration.
      </p>
    </section>
  );
}
