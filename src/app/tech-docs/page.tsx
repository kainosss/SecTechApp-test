import type { Metadata } from "next";
import { TechDocsApp } from "@/components/techdocs/TechDocsApp";

export const metadata: Metadata = { title: "Technical Docs" };

export default function TechDocsPage() {
  return (
    <>
      <header className="mb-4">
        <p className="mb-1 font-mono text-xs tracking-[0.18em] text-signal-400 uppercase">Technical Docs</p>
        <h1 className="text-xl font-semibold tracking-tight text-fg sm:text-3xl">Site equipment registers</h1>
        <p className="mt-1 max-w-2xl text-[15px] leading-relaxed text-fg-muted">
          Record equipment, firmware, network settings and access requirements per site — no service report needed — and export an editable Excel workbook.
        </p>
      </header>
      <TechDocsApp />
    </>
  );
}
