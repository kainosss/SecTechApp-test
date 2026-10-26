import { CLASSIFICATION_LABELS, CLASSIFICATION_SHORT, type CircuitClassification } from "@/lib/eol/classification";

const STYLE: Record<CircuitClassification, string> = {
  "manufacturer-confirmed": "text-verified border-verified/40 bg-verified/10",
  "electrically-validated": "text-signal-300 border-signal-400/40 bg-signal-500/10",
  custom: "text-amber-300 border-amber-300/40 bg-amber-300/10",
  "needs-verification": "text-unverified border-unverified/40 bg-unverified/10",
  demonstration: "text-example border-example/40 bg-example/10",
  invalid: "text-fault border-fault/40 bg-fault/10",
};

/** Separates electrical validity from manufacturer confirmation in one clear chip. */
export function ClassificationBadge({ value, full = false }: { value: CircuitClassification; full?: boolean }) {
  return (
    <span
      title={CLASSIFICATION_LABELS[value]}
      data-classification={value}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STYLE[value]}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {full ? CLASSIFICATION_LABELS[value] : CLASSIFICATION_SHORT[value]}
    </span>
  );
}
