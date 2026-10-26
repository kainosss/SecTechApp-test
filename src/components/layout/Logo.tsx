import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-2.5" aria-label="Fieldwise home">
      <span className="relative grid size-8 place-items-center rounded-lg bg-signal-500/15 ring-1 ring-signal-400/40">
        <svg viewBox="0 0 24 24" className="size-5 text-signal-400" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 12h3l2-5 3 10 3-10 2 5h5" />
        </svg>
      </span>
      <span className="text-[17px] font-semibold tracking-tight text-fg">
        Field<span className="text-signal-400">wise</span>
      </span>
    </Link>
  );
}
