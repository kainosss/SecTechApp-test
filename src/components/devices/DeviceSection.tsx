export interface SectionLink {
  id: string;
  label: string;
}

export function DeviceSection({
  id,
  title,
  aside,
  children,
}: {
  id: string;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-28 rounded-2xl border border-line bg-ink-900 lg:scroll-mt-16">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-line px-4">
        <h2 id={`${id}-heading`} className="text-sm font-semibold text-fg">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Sticky jump links so long device pages need no scrolling hunt on a phone. */
export function SectionNav({ links }: { links: SectionLink[] }) {
  return (
    <nav
      aria-label="On this page"
      className="sticky top-14 z-20 -mx-4 border-b border-line bg-ink-950/95 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-xl sm:border lg:top-0"
    >
      <ul className="flex gap-1 overflow-x-auto">
        {links.map((l) => (
          <li key={l.id}>
            <a
              href={`#${l.id}`}
              className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium whitespace-nowrap text-fg-muted hover:bg-ink-850 hover:text-fg"
            >
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
