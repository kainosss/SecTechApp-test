import Link from "next/link";
import { isDemoModeEnabled } from "@/lib/config";
import { Icon } from "./Icon";

/**
 * Site-wide content notice. In demo mode it warns that fictional records are
 * mixed in; otherwise it is the pilot notice: content may be unverified and
 * records stay in this browser.
 */
export function DemoNotice({ compact = false }: { compact?: boolean }) {
  const demo = isDemoModeEnabled();
  return (
    <div
      role="note"
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm text-fg ${
        demo ? "border-example/30 bg-example/[0.07]" : "border-unverified/25 bg-unverified/[0.05]"
      }`}
    >
      <Icon name="alert" className={`mt-0.5 size-4 shrink-0 ${demo ? "text-example" : "text-unverified"}`} />
      <p className="leading-relaxed">
        {demo ? (
          <>
            <span className="font-semibold text-example">Demo mode is on.</span>{" "}
            Fictional demonstration devices are included{compact ? "." : " for development and testing. Never use them on site."}
          </>
        ) : (
          <>
            <span className="font-semibold text-unverified">Pilot.</span>{" "}
            {compact
              ? "Technical information may be incomplete or unverified — manufacturer documentation takes precedence. Records stay in this browser only; use fictional data."
              : "Device records are still being checked against manufacturer documentation. Anything not marked Verified must be confirmed with the manufacturer's manual before you rely on it."}{" "}
            <Link href="/help#pilot" className="font-medium text-signal-400 underline-offset-2 hover:underline">
              Pilot notice
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
