"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, TOOLS, isActivePath } from "@/lib/navigation";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "./Logo";

const LONG_LABELS: Record<string, string> = Object.fromEntries(TOOLS.map((t) => [t.href, t.title]));

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-line bg-ink-900/80 px-4 py-5 backdrop-blur lg:flex">
      <div className="px-2">
        <Logo />
      </div>
      <nav aria-label="Primary" className="mt-8 flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`group relative flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
                active ? "bg-ink-800 text-fg" : "text-fg-muted hover:bg-ink-850 hover:text-fg"
              }`}
            >
              {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-signal-400" aria-hidden="true" />}
              <Icon name={item.icon} className={`size-5 ${active ? "text-signal-400" : ""}`} />
              {LONG_LABELS[item.href] ?? (item.href === "/" ? "Dashboard" : item.label)}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto rounded-lg border border-line bg-ink-850 p-3 text-xs leading-relaxed text-fg-muted">
        <p className="font-mono tracking-wider text-fg-subtle uppercase">Build 0.3 · Beta</p>
        <p className="mt-1">Records are still being verified. Accounts and subscriptions are not enabled yet.</p>
      </div>
    </aside>
  );
}
