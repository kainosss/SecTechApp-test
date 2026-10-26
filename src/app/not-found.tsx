import Link from "next/link";

export default function NotFound() {
  return (
    <div className="rounded-2xl border border-line bg-ink-900 p-6">
      <p className="font-mono text-xs tracking-widest text-signal-400 uppercase">404</p>
      <h1 className="mt-2 text-lg font-semibold text-fg">Page not found</h1>
      <Link href="/" className="mt-4 inline-block text-sm font-medium text-signal-400">
        Back to dashboard
      </Link>
    </div>
  );
}
