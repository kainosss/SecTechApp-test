import Link from "next/link";
import type { ToolDefinition } from "@/lib/navigation";
import { Icon } from "@/components/ui/Icon";

const STATUS_LABEL: Record<ToolDefinition["status"], string> = {
  available: "Available",
  preview: "Preview",
  planned: "Coming soon",
};

export function ToolCards({ tools }: { tools: ToolDefinition[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((tool, i) => (
        <li key={tool.id}>
          <Link
            href={tool.href}
            className="group relative flex h-full items-center gap-4 overflow-hidden rounded-2xl border border-line bg-ink-900 p-4 transition-colors hover:border-line-strong hover:bg-ink-850 active:bg-ink-800 sm:flex-col sm:items-start sm:p-5"
          >
            <span className="absolute top-3 right-4 hidden font-mono text-[11px] text-fg-subtle sm:block" aria-hidden="true">
              0{i + 1}
            </span>
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-signal-500/10 text-signal-400 ring-1 ring-signal-400/25 ring-inset">
              <Icon name={tool.icon} className="size-6" />
            </span>
            <span className="min-w-0 flex-1 sm:mt-2">
              <span className="flex items-center gap-2">
                <span className="text-[15px] font-semibold text-fg">{tool.title}</span>
              </span>
              <span className="mt-0.5 block text-[13px] leading-snug text-fg-muted">{tool.description}</span>
              <span
                className={`mt-2 inline-block font-mono text-[11px] tracking-wider uppercase ${
                  tool.status === "planned" ? "text-fg-subtle" : "text-signal-400"
                }`}
              >
                {STATUS_LABEL[tool.status]}
              </span>
            </span>
            <Icon name="chevron-right" className="size-5 shrink-0 text-fg-subtle group-hover:text-fg sm:hidden" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
