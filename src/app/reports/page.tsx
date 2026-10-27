import type { Metadata } from "next";
import { ReportsApp } from "@/components/reports/ReportsApp";

export const metadata: Metadata = { title: "Service Reports" };

export default function ReportsPage() {
  return (
    <>
      <header className="mb-4">
        <p className="mb-1 font-mono text-xs tracking-[0.18em] text-signal-400 uppercase">Service Reports</p>
        <h1 className="text-xl font-semibold tracking-tight text-fg sm:text-3xl">Quick service report</h1>
        <p className="mt-1 max-w-2xl text-[15px] leading-relaxed text-fg-muted">
          Add equipment and findings as you work, then generate an editable Excel workbook in one tap.
        </p>
      </header>
      <ReportsApp />
    </>
  );
}
