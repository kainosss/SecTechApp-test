import { formatOhms } from "@/lib/eol/engine";
import type { CheckResult } from "@/lib/lab/check";

const SEVERITY = {
  error: { mark: "✗", label: "Problem", cls: "border-fault/40 bg-fault/[0.07]", text: "text-fault" },
  warning: { mark: "!", label: "Check", cls: "border-amber-300/40 bg-amber-300/[0.07]", text: "text-amber-300" },
  success: { mark: "✓", label: "Correct", cls: "border-verified/40 bg-verified/[0.08]", text: "text-verified" },
  info: { mark: "i", label: "Note", cls: "border-line-strong bg-ink-850", text: "text-signal-300" },
} as const;

export function LabFeedback({ result }: { result: CheckResult }) {
  return (
    <div className="mt-3 flex flex-col gap-3">
      <p className={`text-[15px] font-semibold ${result.correct ? "text-verified" : "text-fault"}`} data-testid="check-verdict">
        {result.correct ? "✓ Correct wiring — all five states pass." : "✗ Not correct yet."}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Simulated readings between Z1 and COM</caption>
          <thead className="text-xs text-fg-subtle">
            <tr>
              <th scope="col" className="py-1 pr-2 font-medium">
                State
              </th>
              <th scope="col" className="py-1 pr-2 font-medium">
                Expected
              </th>
              <th scope="col" className="py-1 pr-2 font-medium">
                Simulated
              </th>
              <th scope="col" className="py-1 font-medium">
                Result
              </th>
            </tr>
          </thead>
          <tbody>
            {result.readings.map((r) => (
              <tr key={r.kind} className="border-t border-line" data-state={r.kind}>
                <th scope="row" className="py-1.5 pr-2 font-medium text-fg">
                  {r.label}
                </th>
                <td className="py-1.5 pr-2 font-mono text-fg-muted">{formatOhms(r.expected)}</td>
                <td className="py-1.5 pr-2 font-mono text-fg">{r.ohms === null ? "Can't evaluate" : formatOhms(r.ohms)}</td>
                <td className={`py-1.5 font-semibold ${r.matches ? "text-verified" : "text-fault"}`}>{r.matches ? "✓ Pass" : "✗ Fail"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-2">
        {result.findings.map((f, i) => {
          const s = SEVERITY[f.severity];
          return (
            <li key={`${f.code}-${i}`} className={`rounded-xl border px-3 py-2.5 text-sm ${s.cls}`} data-finding={f.code}>
              <p className="font-semibold text-fg">
                <span className={`mr-1.5 ${s.text}`} aria-hidden="true">
                  {s.mark}
                </span>
                <span className="sr-only">{s.label}: </span>
                {f.title}
              </p>
              {f.why && (
                <p className="mt-1 text-fg-muted">
                  <span className="font-medium text-fg">Why it matters: </span>
                  {f.why}
                </p>
              )}
              {f.fix && (
                <p className="mt-1 text-fg-muted">
                  <span className="font-medium text-fg">How to fix: </span>
                  {f.fix}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-fg-subtle">Simulated readings from a circuit model of your wiring. Not a measurement, and not a panel-specific installation diagram.</p>
    </div>
  );
}
