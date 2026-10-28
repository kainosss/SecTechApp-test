"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { readLibraryState } from "@/lib/storage/library-state";
import { Icon } from "@/components/ui/Icon";

const noop = () => () => {};

/** Returns to the technician's last Device Library search (filters, page and scroll) for this tab. */
export function BackToLibrary() {
  const href = useSyncExternalStore(noop, () => readLibraryState()?.url ?? "/devices", () => "/devices");
  const filtered = href !== "/devices";
  return (
    <Link
      href={href}
      className="-ml-2 inline-flex h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-fg-muted hover:bg-ink-850 hover:text-fg"
    >
      <Icon name="chevron-right" className="size-4 rotate-180" />
      {filtered ? "Back to results" : "Device Library"}
    </Link>
  );
}
