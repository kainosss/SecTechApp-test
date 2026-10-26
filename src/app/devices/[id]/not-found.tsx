import Link from "next/link";

export default function DeviceNotFound() {
  return (
    <div className="rounded-2xl border border-line bg-ink-900 p-6">
      <h1 className="text-lg font-semibold text-fg">Device not found</h1>
      <p className="mt-1 text-sm text-fg-muted">It may have been renamed or removed from the library.</p>
      <Link href="/devices" className="mt-4 inline-block text-sm font-medium text-signal-400">
        Back to Device Library
      </Link>
    </div>
  );
}
