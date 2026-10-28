// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkLogoBytes, EMPTY_BRANDING, fitLogo, MAX_LOGO_BYTES } from "@/lib/handover/branding";
import { availableSections, DEFAULT_OPTIONS, documentText, handoverDocument, type HandoverOptions } from "@/lib/handover/content";
import { CONTENT_BOTTOM, CONTENT_W, MARGIN, PAGE, wrap, type Measure, type Op, type Page } from "@/lib/handover/layout";
import { fontMeasure, generateHandover, handoverFileName } from "@/lib/handover/pdf";
import { applyEdit, createReport } from "@/lib/reports/report";
import type { Report } from "@/lib/reports/schema";
import { linkedItem, linkReport } from "@/lib/sites/link";
import { accessFaults, cctvFaults, emptyReport, intruderInspection, largeRegister, longText, shortCctv } from "../reports/fixtures";
import { cctvInstall } from "../techdocs/fixtures";
import { sampleBranding, sampleLogoPng } from "./fixtures";
import { nodeFonts } from "./fonts";

const hasPdftotext = (() => {
  try {
    execFileSync("pdftotext", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

let measure: Measure;
beforeAll(async () => {
  measure = await fontMeasure(nodeFonts);
});

const opts = (o: Partial<HandoverOptions> = {}) => ({ ...DEFAULT_OPTIONS, ...o });
const gen = (r: Report, o: Partial<HandoverOptions> = {}, b = EMPTY_BRANDING) => generateHandover(r, opts(o), b, nodeFonts);
const texts = (pages: Page[]) => pages.flatMap((p) => p.ops.filter((o): o is Extract<Op, { t: "text" }> => o.t === "text").map((o) => o.s));
/** Body text only (no running header or footer), in reading order. */
const bodyTexts = (pages: Page[]) => pages.flatMap((p) => p.ops.filter((o): o is Extract<Op, { t: "text" }> => o.t === "text" && o.y > 52 && o.y < CONTENT_BOTTOM).map((o) => o.s));
const runningHeader = (p: Page) => p.ops.find((o): o is Extract<Op, { t: "text" }> => o.t === "text" && o.y === 40 && o.x === MARGIN)?.s;
const pageText = (pages: Page[]) => texts(pages).join("\n");
const headings = (pages: Page[]) =>
  pages.flatMap((p, i) =>
    p.ops.flatMap((o, k) => (o.t === "text" && /^\d+$/.test(o.s) && o.size === 10.5 && p.ops[k + 1]?.t === "text" ? [{ page: i, y: o.y, title: (p.ops[k + 1] as { s: string }).s }] : [])),
  );

describe("document content", () => {
  it("uses the report's details and counts, numbering only included sections", () => {
    const d = handoverDocument(intruderInspection());
    expect(d).toMatchObject({ title: "SECURITY SERVICE REPORT", subtitle: "INTRUDER ALARM SERVICE", date: "27 Oct 2026", reference: "INSP-2026-118", siteName: "Riverside Medical Centre" });
    expect(d.blocks.filter((b) => b.kind === "heading").map((b) => (b.kind === "heading" ? `${b.number} ${b.text}` : ""))).toEqual([
      "1 Site and customer details",
      "2 Inspection overview",
      "3 Work completed",
      "4 Identified defects",
      "5 Recommendations",
      "6 Equipment inspection schedule",
      "7 Additional information",
    ]);
    const kpis = d.blocks.find((b) => b.kind === "kpis");
    expect(kpis?.kind === "kpis" && kpis.tiles.map((t) => [t.label, t.value])).toEqual([
      ["Inspected", 8],
      ["Passed", 6],
      ["Faults", 1],
      ["Recommendations", 1],
      ["Not tested", 1], // never counted as passed or faulty
    ]);
    const pairs = d.blocks.find((b) => b.kind === "pairs");
    expect(pairs?.kind === "pairs" && pairs.pairs.map((p) => p.label)).toEqual(["Customer", "Site", "Site address", "Technician", "Inspection date", "Job reference"]);
  });

  it("lists only Fault items as defects, with entered priority and work, and never invents actions", () => {
    const d = handoverDocument(cctvFaults());
    const defects = d.blocks.filter((b) => b.kind === "table")[0]!;
    if (defects.kind !== "table") throw new Error();
    expect(defects.columns.map((c) => c.header)).toEqual(["Equipment", "Location", "Finding", "Work performed", "Priority"]);
    expect(defects.rows.map((r) => r.map((c) => c.text))).toEqual([
      ["NVR 1", "Security office", "Drive 2 reporting SMART errors; recording gaps overnight", "Exported last 7 days of footage for client", "High"],
      ["Camera 1", "Car park level 1", "Image out of focus after bracket was knocked", "Re-aimed camera; focus still soft", "Medium"],
      ["Camera 3", "Loading dock", "No IR at night", "", ""], // nothing entered → blank, not invented
    ]);
    const recs = d.blocks.filter((b) => b.kind === "table")[1]!;
    if (recs.kind !== "table") throw new Error();
    expect(recs.rows.map((r) => r.map((c) => c.text))).toEqual([
      ["NVR 1", "Security office", "Replace HDD 2 and verify retention", "High"],
      ["Camera 1", "Car park level 1", "Replace bracket and refocus", "Medium"],
      ["Network switch 1", "Comms rack", "Plan PoE budget before adding cameras", "Low"],
    ]);
  });

  it("uses restrained wording when nothing is faulty and makes no compliance claims", () => {
    const r = applyEdit(shortCctv(), { type: "update-item", id: shortCctv().equipment[0]!.id, patch: {} });
    const passOnly = { ...r, equipment: r.equipment.map((i) => ({ ...i, status: "pass" as const, recommendations: "" })), summary: { ...r.summary, faults: "" } };
    const text = documentText(handoverDocument(passOnly)).join("\n");
    expect(text).toContain("No equipment was recorded as faulty during this service.");
    for (const claim of [/complian/i, /certif/i, /approved/i, /signature/i, /safe to/i, /meets? (the )?standard/i]) expect(text).not.toMatch(claim);
  });

  it("drops sections that are switched off or empty, and reports them", () => {
    const d = handoverDocument(emptyReport());
    expect(d.included).toEqual(["overview"]);
    expect(d.empty).toEqual(["work", "defects", "recommendations", "schedule", "notes"]);
    expect(documentText(d).join("\n")).toContain("No equipment was recorded in this report.");
    const off = handoverDocument(cctvFaults(), opts({ schedule: false, overview: false }));
    expect(off.included).toEqual(["work", "defects", "recommendations", "notes"]);
    expect(availableSections(shortCctv())).toMatchObject({ overview: true, work: true, defects: true, schedule: true });
  });

  it("doesn't repeat a fault's finding in the schedule when Identified defects is included", () => {
    const sched = (o: Partial<HandoverOptions>) => {
      const t = handoverDocument(cctvFaults(), opts(o)).blocks.filter((b) => b.kind === "table").at(-1)!;
      return t.kind === "table" ? t.rows[0]!.map((c) => c.text) : [];
    };
    expect(sched({})).toEqual(["1", "NVR 1", "Security office", "Fault", "Refer to section 4"]);
    expect(sched({ defects: false })[4]).toBe("Drive 2 reporting SMART errors; recording gaps overnight");
  });

  it("never includes network settings, register details, snapshots or item notes", () => {
    const site = cctvInstall();
    let r = linkReport(createReport("cctv", "Alex"), site, false);
    r = applyEdit(r, { type: "add-items", items: site.equipment.slice(2, 6).map((e) => linkedItem(site, e)) }); // cameras (their switch is SW-CAM-01)
    r = applyEdit(r, { type: "update-item", id: r.equipment[1]!.id, patch: { status: "fault", findings: "No video", notes: "INTERNAL: admin login reset" } });
    const text = documentText(handoverDocument(r)).join("\n");
    expect(text).toContain("CAM-01");
    for (const secret of ["10.20.0.", "255.255.255.0", "00:11:22", "SW-CAM-01", "EVD4-", "V5.7", "WG-CAM", "INTERNAL", "Comms room key", "VLAN"]) expect(text, secret).not.toContain(secret);
  });
});

describe("layout", () => {
  it("wraps text to the width, keeps line breaks and breaks over-long words", () => {
    const lines = wrap("First line\n\nSecond paragraph with several words to wrap " + "x".repeat(200), "regular", 10, 150, measure);
    expect(lines[0]).toBe("First line");
    expect(lines[1]).toBe("");
    for (const l of lines) expect(measure(l, "regular", 10)).toBeLessThanOrEqual(150.01);
    expect(lines.join("").replace(/\s/g, "")).toBe(("First line" + "Second paragraph with several words to wrap " + "x".repeat(200)).replace(/\s/g, ""));
  });

  it("keeps every element inside the page margins on every sample", async () => {
    for (const make of [shortCctv, cctvFaults, intruderInspection, accessFaults, longText, largeRegister, emptyReport]) {
      for (const b of [EMPTY_BRANDING, sampleBranding()]) {
        const { pages } = await gen(make(), {}, b);
        pages.forEach((p, i) => {
          for (const o of p.ops) {
            const where = `${make.name} page ${i + 1} ${JSON.stringify(o).slice(0, 80)}`;
            if (o.t === "text") {
              const w = measure(o.s, o.font, o.size);
              const x0 = o.align === "right" ? o.x - w : o.align === "center" ? o.x - w / 2 : o.x;
              expect(x0, where).toBeGreaterThanOrEqual(MARGIN - 0.5);
              expect(x0 + w, where).toBeLessThanOrEqual(MARGIN + CONTENT_W + 0.5);
              expect(o.y, where).toBeGreaterThan(20);
              expect(o.y, where).toBeLessThan(PAGE.h - 20);
              expect(o.size, where).toBeGreaterThanOrEqual(7);
            } else if (o.t === "rect" || o.t === "image") {
              expect(o.x, where).toBeGreaterThanOrEqual(MARGIN - 0.5);
              expect(o.x + o.w, where).toBeLessThanOrEqual(MARGIN + CONTENT_W + 0.5);
              expect(o.y + o.h, where).toBeLessThanOrEqual(CONTENT_BOTTOM + 0.5);
            }
          }
        });
      }
    }
  });

  it("never overlaps text", async () => {
    for (const make of [cctvFaults, intruderInspection, longText, largeRegister]) {
      const { pages } = await gen(make(), {}, sampleBranding());
      for (const p of pages) {
        const boxes = p.ops.flatMap((o) => {
          if (o.t !== "text") return [];
          const w = measure(o.s, o.font, o.size);
          const x0 = o.align === "right" ? o.x - w : o.align === "center" ? o.x - w / 2 : o.x;
          return [{ x0, x1: x0 + w, y0: o.y - o.size * 0.72, y1: o.y + o.size * 0.2, s: o.s }];
        });
        for (let i = 0; i < boxes.length; i++)
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i]!;
            const b = boxes[j]!;
            const hit = a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5;
            expect(hit, `${make.name}: "${a.s}" overlaps "${b.s}"`).toBe(false);
          }
      }
    }
  });

  it("keeps headings with their content (none stranded at the foot of a page)", async () => {
    for (const make of [shortCctv, cctvFaults, intruderInspection, accessFaults, longText, largeRegister]) {
      const { pages } = await gen(make(), {}, sampleBranding());
      for (const h of headings(pages)) {
        const below = pages[h.page]!.ops.filter((o) => o.t === "text" && o.y > h.y + 10);
        expect(below.length, `${make.name}: "${h.title}" on page ${h.page + 1}`).toBeGreaterThan(2);
      }
    }
  });

  it("flows large schedules across pages with repeated table headers and page numbers", async () => {
    const { pages } = await gen(largeRegister());
    expect(pages.length).toBeGreaterThan(4);
    const t = pageText(pages);
    for (let i = 1; i <= 120; i++) expect(t).toContain(`\n${i}\n`);
    pages.forEach((p, i) => {
      const s = texts([p]);
      expect(s).toContain(`Page ${i + 1} of ${pages.length}`);
      expect(s).toContain("Generated with Fieldwise");
      if (i > 0) expect(s.some((x) => x === "EQUIPMENT" || x === "NO.")).toBe(true);
    });
  });

  it("keeps long narrative complete across pages", async () => {
    const r = longText();
    const { pages } = await gen(r);
    const flat = bodyTexts(pages).join(" ").replace(/\s+/g, "");
    expect(flat).toContain(r.summary.workCompleted.replace(/\s+/g, ""));
    expect(flat).toContain(r.description.replace(/\s+/g, ""));
  });

  it("produces one page for a minimal report and no blank pages anywhere", async () => {
    expect((await gen(emptyReport())).pages).toHaveLength(1);
    for (const make of [shortCctv, longText, largeRegister]) {
      const { pages } = await gen(make());
      for (const p of pages) expect(p.ops.filter((o) => o.t === "text").length).toBeGreaterThan(5);
    }
  });
});

describe("branding", () => {
  it("shows configured company details and logo, unbranded otherwise", async () => {
    const b = sampleBranding();
    const branded = await gen(cctvFaults(), {}, b);
    const first = texts([branded.pages[0]!]);
    expect(first).toEqual(expect.arrayContaining(["Example Security Services", "Unit 3, 10 Example Street, Sydney NSW 2000", "ABN 00 000 000 000"]));
    const logo = branded.pages[0]!.ops.find((o) => o.t === "image");
    expect(logo).toMatchObject({ format: "PNG", w: expect.closeTo(162, 0), h: expect.closeTo(54, 0) }); // 3:1 kept
    expect(runningHeader(branded.pages[1]!)).toBe("Example Security Services");
    const plain = await gen(cctvFaults());
    expect(plain.pages[0]!.ops.some((o) => o.t === "image")).toBe(false);
    expect(pageText(plain.pages)).not.toMatch(/Example Security|ABN/);
    expect(runningHeader(plain.pages[1]!)).toBe("Security Service Report");
  });

  it("validates logos by content and size, and fits without stretching", () => {
    expect(checkLogoBytes(new Uint8Array(sampleLogoPng()))).toMatchObject({ ok: true, format: "PNG" });
    expect(checkLogoBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]))).toMatchObject({ ok: true, format: "JPEG" });
    expect(checkLogoBytes(new TextEncoder().encode("<svg onload=alert(1)>"))).toMatchObject({ ok: false });
    expect(checkLogoBytes(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toMatchObject({ ok: false }); // GIF
    expect(checkLogoBytes(new Uint8Array(10), MAX_LOGO_BYTES + 1)).toMatchObject({ ok: false, error: expect.stringMatching(/KB or smaller/) });
    expect(checkLogoBytes(new Uint8Array(0))).toMatchObject({ ok: false });
    expect(fitLogo({ width: 1000, height: 1000 }, { w: 170, h: 54 })).toEqual({ w: 54, h: 54 });
    expect(fitLogo({ width: 600, height: 100 }, { w: 170, h: 54 })).toEqual({ w: 170, h: 170 / 6 });
  });
});

describe("PDF output", () => {
  it("is a valid PDF whose pages are exactly the previewed pages", async () => {
    const h = await gen(intruderInspection(), {}, sampleBranding());
    const pdf = new TextDecoder("latin1").decode(new Uint8Array(h.bytes));
    expect(pdf.startsWith("%PDF-")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    expect((pdf.match(/\/Type \/Page\b/g) ?? []).length).toBe(h.pages.length);
    expect(pdf).toContain("/Carlito");
    expect(pdf).toContain("/Subtype /Image");
    expect(pdf).not.toMatch(/\/(JavaScript|JS|Launch|URI|SubmitForm)\b/);
    // Same input → same layout (preview and download come from one generation).
    const again = await gen(intruderInspection(), {}, sampleBranding());
    expect(again.pages).toEqual(h.pages);
  });

  it("draws symbols with the fallback font and leaves plain reports on the main font only", async () => {
    const r = { ...shortCctv(), siteName: "Depot ✓ ✗ → ≤ ≥ ± ° ℃ Ω ⌀ ½ — café", description: "Ticks ☑ ☐ and ⚠ warnings; 12 V ≈ 12.0 V" };
    const h = await gen(r);
    expect(h.usedSymbols).toBe(true);
    expect(h.unsupported).toEqual({ chars: [], places: [] });
    expect(h.document.siteName).toBe(r.siteName); // nothing substituted
    const op = h.pages[0]!.ops.find((o): o is Extract<Op, { t: "text" }> => o.t === "text" && o.s.startsWith("Depot"))!;
    expect(op.runs?.filter((x) => x.symbols).map((x) => x.s).join("")).toContain("✓");
    expect(op.runs?.map((x) => x.s).join("")).toBe(op.s);
    const pdf = new TextDecoder("latin1").decode(new Uint8Array(h.bytes));
    expect(pdf).toContain("/FieldwiseSymbols");
    expect(pdf).toContain("/ToUnicode");
    const plain = await gen(shortCctv());
    expect(plain.usedSymbols).toBe(false);
    expect(new TextDecoder("latin1").decode(new Uint8Array(plain.bytes))).not.toContain("/FieldwiseSymbols");
    expect(plain.pages.every((p) => p.ops.every((o) => o.t !== "text" || !o.runs))).toBe(true);
  });

  it("lists characters no font can draw, with where they appear, instead of dropping them silently", async () => {
    const r = { ...shortCctv(), siteName: "Depot 😀 ✓", summary: { ...shortCctv().summary, notes: "Key safe 日本 location" } };
    const h = await gen(r);
    expect(h.unsupported.chars.sort()).toEqual(["日", "本", "😀"].sort());
    expect(h.unsupported.places).toEqual(
      expect.arrayContaining([
        { where: "Site name", excerpt: "Depot 😀 ✓" },
        { where: "Additional information", excerpt: "Key safe 日本 location" },
      ]),
    );
    expect(h.document.siteName).toBe("Depot ? ✓");
  });

  it.skipIf(!hasPdftotext)("keeps text extractable, including fallback symbols", async () => {
    const h = await gen({ ...shortCctv(), siteName: "Depot ✓ 2.2 kΩ → 5 °C" });
    const dir = mkdtempSync(join(tmpdir(), "fw-"));
    const file = join(dir, "h.pdf");
    writeFileSync(file, Buffer.from(h.bytes));
    const text = execFileSync("pdftotext", [file, "-"]).toString();
    expect(text).toContain("Depot ✓ 2.2 kΩ → 5 °C");
    expect(text).toContain("SECURITY SERVICE REPORT");
  });

  it("names files from the report", () => {
    expect(handoverFileName(intruderInspection())).toBe("Service-Report-Riverside-Medical-Centre-INSP-2026-118-2026-10-27.pdf");
    expect(handoverFileName({ ...createReport("cctv"), date: "" })).toBe("Service-Report-Untitled.pdf");
  });
});
