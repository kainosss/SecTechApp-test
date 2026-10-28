"use client";

import Link from "next/link";
import { showWelcomeAgain } from "@/lib/onboarding";

export function ShowWelcomeButton() {
  return (
    <Link href="/" onClick={showWelcomeAgain} className="inline-flex h-11 items-center rounded-lg border border-line-strong px-3 text-sm font-medium text-fg hover:bg-ink-800">
      Show the welcome again
    </Link>
  );
}
