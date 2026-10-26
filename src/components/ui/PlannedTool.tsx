import { Icon, type IconKey } from "./Icon";
import { PageHeader } from "./PageHeader";

export function PlannedTool({
  icon,
  title,
  phase,
  description,
  steps,
  safeguards,
}: {
  icon: IconKey;
  title: string;
  phase: string;
  description: string;
  steps: string[];
  safeguards: string[];
}) {
  return (
    <>
      <PageHeader eyebrow={`Coming soon · ${phase}`} title={title} description={description} />
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-line bg-ink-900 p-5">
          <span className="grid size-11 place-items-center rounded-xl bg-signal-500/10 text-signal-400 ring-1 ring-signal-400/25 ring-inset">
            <Icon name={icon} className="size-6" />
          </span>
          <h2 className="mt-4 text-sm font-semibold text-fg">How it will work</h2>
          <ol className="mt-3 space-y-2.5">
            {steps.map((s, i) => (
              <li key={s} className="flex gap-3 text-sm text-fg-muted">
                <span className="font-mono text-xs leading-5 text-signal-400">0{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        </section>
        <section className="rounded-2xl border border-line bg-ink-900 p-5">
          <span className="grid size-11 place-items-center rounded-xl bg-verified/10 text-verified ring-1 ring-verified/25 ring-inset">
            <Icon name="shield" className="size-6" />
          </span>
          <h2 className="mt-4 text-sm font-semibold text-fg">Accuracy safeguards</h2>
          <ul className="mt-3 space-y-2.5">
            {safeguards.map((s) => (
              <li key={s} className="flex gap-3 text-sm text-fg-muted">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-verified" aria-hidden="true" />
                {s}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
