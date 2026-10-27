"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { readSavedRaw, savedProgress, subscribeSessions } from "@/lib/fault-finder/sessions";
import { VERIFICATION_LABELS } from "@/lib/fault-finder/schema";
import { WORKFLOWS } from "@/lib/fault-finder/workflows";
import { Icon } from "@/components/ui/Icon";

const AREA = { intrusion: "Intrusion alarm", access: "Access control" } as const;

/** The guided diagnostic workflows, with a Resume badge where a session is saved on this device. */
export function GuideList() {
  const raw = useSyncExternalStore(subscribeSessions, () => readSavedRaw() ?? "", () => "");
  const progress = useMemo(() => savedProgress(raw || null, WORKFLOWS), [raw]);
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Guided diagnoses">
      {WORKFLOWS.map((w) => {
        const answers = progress[w.id] ?? 0;
        return (
          <li key={w.id}>
            <Link
              href={`/fault-finder/diagnose/${w.id}`}
              data-guide={w.id}
              className="group flex h-full gap-3 rounded-2xl border border-line bg-ink-900 p-4 transition-colors hover:border-line-strong hover:bg-ink-850"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-signal-500/10 text-signal-400 ring-1 ring-signal-400/25 ring-inset">
                <Icon name={w.icon} className="size-6" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] tracking-wider text-fg-subtle uppercase">{AREA[w.area]}</span>
                  {answers > 0 && (
                    <span className="rounded-full bg-signal-500/15 px-2 py-0.5 text-[11px] font-medium text-signal-300" data-testid="resume-badge">
                      Resume · {answers} answer{answers === 1 ? "" : "s"}
                    </span>
                  )}
                </span>
                <span className="text-[15px] font-semibold text-fg">{w.title}</span>
                <span className="text-[13px] leading-snug text-fg-muted">{w.summary}</span>
                <span className="text-[11px] font-medium text-unverified" data-testid="guide-verification">
                  {VERIFICATION_LABELS[w.verification.status]}
                </span>
              </span>
              <Icon name="chevron-right" className="size-5 shrink-0 self-center text-fg-subtle group-hover:text-fg" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
