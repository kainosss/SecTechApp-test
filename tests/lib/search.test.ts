import { describe, expect, it } from "vitest";
import { normalise, search, type SearchDocument } from "@/lib/search/search";
import { buildSearchIndex } from "@/lib/search/build-index";

const docs: SearchDocument[] = [
  { id: "a", type: "device", title: "KS-PIR12 — PIR Detector", subtitle: "Kestrel", href: "/a", keywords: ["KS-PIR12", "motion"] },
  { id: "b", type: "device", title: "KS-RS1 — Reed Switch", subtitle: "Kestrel", href: "/b", keywords: ["KS-RS1", "door contact"] },
  { id: "c", type: "tool", title: "EOL Wiring Assistant", subtitle: "", href: "/eol", keywords: ["resistor"] },
];

describe("search", () => {
  it("normalises punctuation and case", () => {
    expect(normalise("  KS-PIR12/v2 ")).toBe("ks pir12 v2");
  });

  it("matches model numbers regardless of formatting", () => {
    for (const q of ["KS-PIR12", "ks pir12", "kspir12", "pir12"]) {
      expect(search(docs, q)[0]?.id, q).toBe("a");
    }
  });

  it("requires every token to match", () => {
    expect(search(docs, "kestrel door").map((r) => r.id)).toEqual(["b"]);
    expect(search(docs, "kestrel siren")).toEqual([]);
  });

  it("returns nothing for an empty query", () => {
    expect(search(docs, "   ")).toEqual([]);
  });

  it("finds tools by keyword", () => {
    expect(search(docs, "resistor")[0]?.id).toBe("c");
  });

  it("indexes shipped devices, manufacturers, wiring, workflows and tools", async () => {
    const index = await buildSearchIndex();
    expect(new Set(index.map((d) => d.type))).toEqual(new Set(["device", "manufacturer", "wiring", "workflow", "tool"]));
    expect(search(index, "SR20")[0]?.href).toBe("/devices/kestrel-demo-ks-sr20");
  });
});
