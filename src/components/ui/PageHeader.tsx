export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-6 lg:mb-8">
      {eyebrow && <p className="mb-2 font-mono text-xs tracking-[0.18em] text-signal-400 uppercase">{eyebrow}</p>}
      <h1 className="text-2xl font-semibold tracking-tight text-balance text-fg sm:text-3xl">{title}</h1>
      {description && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-fg-muted">{description}</p>}
      {children}
    </header>
  );
}
