import type { VerificationStatus } from "@/lib/content/schema";

const STYLES: Record<VerificationStatus, { label: string; className: string; title: string }> = {
  verified: {
    label: "Verified",
    className: "text-verified border-verified/40 bg-verified/10",
    title: "Checked against the cited manufacturer documentation",
  },
  unverified: {
    label: "Unverified",
    className: "text-unverified border-unverified/40 bg-unverified/10",
    title: "Not yet checked against a manufacturer source — confirm before use",
  },
  example: {
    label: "Example data",
    className: "text-example border-example/40 bg-example/10",
    title: "Fictional demonstration content — do not use on site",
  },
};

export function VerificationBadge({ status, className = "" }: { status: VerificationStatus; className?: string }) {
  const style = STYLES[status];
  return (
    <span
      title={style.title}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[11px] font-medium tracking-wide uppercase ${style.className} ${className}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {style.label}
    </span>
  );
}
