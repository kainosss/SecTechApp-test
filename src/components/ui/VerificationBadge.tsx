import { STATUS_LABELS, type VerificationStatus } from "@/lib/content/schema";

const STYLES: Record<VerificationStatus, { className: string; title: string }> = {
  verified: {
    className: "text-verified border-verified/40 bg-verified/10",
    title: "Checked by a named reviewer against the cited manufacturer document",
  },
  "needs-verification": {
    className: "text-unverified border-unverified/40 bg-unverified/10",
    title: "Not yet verified against manufacturer documentation — confirm before relying on it",
  },
  demonstration: {
    className: "text-example border-example/40 bg-example/10",
    title: "Fictional demonstration content — never use on site",
  },
};

export function VerificationBadge({ status, className = "" }: { status: VerificationStatus; className?: string }) {
  const style = STYLES[status];
  return (
    <span
      title={style.title}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[11px] font-medium tracking-wide whitespace-nowrap uppercase ${style.className} ${className}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}
