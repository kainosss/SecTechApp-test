"use client";

import { FONT_FILES } from "@/lib/handover/pdf";
import { PAGE, type Page } from "@/lib/handover/layout";

/** The bundled PDF font, so on-screen pages use exactly the PDF's letterforms and widths. */
const FONT_CSS = `@font-face{font-family:FieldwisePdf;src:url(${FONT_FILES.text.regular}) format("truetype");font-weight:400}
@font-face{font-family:FieldwisePdf;src:url(${FONT_FILES.text.bold}) format("truetype");font-weight:700}
@font-face{font-family:FieldwisePdfSymbols;src:url(${FONT_FILES.symbols.regular}) format("truetype");font-weight:400}
@font-face{font-family:FieldwisePdfSymbols;src:url(${FONT_FILES.symbols.bold}) format("truetype");font-weight:700}`;

const anchor = { left: "start", right: "end", center: "middle" } as const;

/** Draws one laid-out PDF page (the same drawing operations the PDF is made from). */
export function PreviewPage({ page, index, total }: { page: Page; index: number; total: number }) {
  return (
    <svg
      viewBox={`0 0 ${PAGE.w} ${PAGE.h}`}
      role="img"
      aria-label={`Page ${index + 1} of ${total}`}
      className="block h-auto w-full rounded-sm bg-white shadow-[0_2px_12px_rgba(0,0,0,0.35)]"
      style={{ fontFamily: "FieldwisePdf, Carlito, Calibri, sans-serif" }}
      data-page={index + 1}
    >
      <rect x={0} y={0} width={PAGE.w} height={PAGE.h} fill="#FFFFFF" />
      {page.ops.map((op, i) => {
        switch (op.t) {
          case "rect":
            return <rect key={i} x={op.x} y={op.y} width={op.w} height={op.h} fill={op.fill} />;
          case "line":
            return <line key={i} x1={op.x1} y1={op.y1} x2={op.x2} y2={op.y2} stroke={op.color} strokeWidth={op.w} />;
          case "image":
            return <image key={i} href={op.data} x={op.x} y={op.y} width={op.w} height={op.h} preserveAspectRatio="xMidYMid meet" />;
          case "text":
            return (
              <text key={i} x={op.x} y={op.y} fontSize={op.size} fontWeight={op.font === "bold" ? 700 : 400} fill={op.color} textAnchor={anchor[op.align ?? "left"]} xmlSpace="preserve">
                {op.runs
                  ? op.runs.map((r, k) => (
                      <tspan key={k} fontFamily={r.symbols ? "FieldwisePdfSymbols, sans-serif" : undefined}>
                        {r.s}
                      </tspan>
                    ))
                  : op.s}
              </text>
            );
        }
      })}
    </svg>
  );
}

export function PreviewFontStyle() {
  return <style>{FONT_CSS}</style>;
}
