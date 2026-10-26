import { describe, expect, it } from "vitest";
import { rawContent } from "@content/index";
import { ContentValidationError, loadContent, type RawContent } from "@/lib/content/loader";

const realManufacturer = { id: "real-co", name: "Real Co" };
const realSource = {
  id: "real-manual",
  title: "Real manual",
  publisher: "Real Co",
  documentType: "installation-manual",
  documentRevision: "Rev 3",
};
const review = { reviewedBy: "A. Reviewer", reviewedAt: "2026-01-10" };

const realDevice = {
  id: "real-device",
  manufacturerId: "real-co",
  model: "R-1",
  name: "R-1 Device",
  category: "other",
  documentation: [{ sourceId: "real-manual" }],
  verification: { status: "needs-verification" },
  updatedAt: "2026-01-01",
};

function withExtra(extra: Partial<Record<keyof RawContent, unknown[]>>): RawContent {
  return {
    manufacturers: [...rawContent.manufacturers, realManufacturer, ...(extra.manufacturers ?? [])],
    sources: [...rawContent.sources, realSource, ...(extra.sources ?? [])],
    devices: [...rawContent.devices, ...(extra.devices ?? [])],
    wiring: [...(rawContent.wiring ?? []), ...(extra.wiring ?? [])],
    workflows: [...(rawContent.workflows ?? []), ...(extra.workflows ?? [])],
  };
}

const verifiedTerminal = {
  label: "+12V",
  function: "Power in",
  status: "verified",
  sourceRefs: [{ sourceId: "real-manual", locator: "p. 4" }],
  appliesToRevisions: ["Rev B"],
  review,
};

describe("shipped content", () => {
  it("passes schema, cross-reference, demo-separation and evidence validation", () => {
    expect(() => loadContent(rawContent)).not.toThrow();
  });

  it("declares every device from a demonstration manufacturer as demonstration", () => {
    const store = loadContent(rawContent);
    const demoMakers = new Set(store.manufacturers.filter((m) => m.isDemo).map((m) => m.id));
    for (const d of store.devices.filter((d) => demoMakers.has(d.manufacturerId))) {
      expect(d.verification.status, d.id).toBe("demonstration");
    }
  });

  it("contains no technical claims on real devices that cite unconfirmed links", () => {
    const store = loadContent(rawContent);
    for (const s of store.sources.filter((s) => s.url)) expect(s.accessedDate, s.id).toBeDefined();
  });
});

describe("evidence rules (fail safe)", () => {
  it("accepts a fully evidenced verified claim", () => {
    expect(() => loadContent(withExtra({ devices: [{ ...realDevice, terminals: [verifiedTerminal] }] }))).not.toThrow();
  });

  it.each([
    ["no reviewer", { review: undefined }],
    ["future review date", { review: { reviewedBy: "A", reviewedAt: "2999-01-01" } }],
    ["invalid review date", { review: { reviewedBy: "A", reviewedAt: "2026-02-31" } }],
    ["no sources", { sourceRefs: [] }],
    ["no applicable revision", { appliesToRevisions: [] }],
  ])("rejects a verified claim with %s", (_name, override) => {
    const device = { ...realDevice, terminals: [{ ...verifiedTerminal, ...override }] };
    expect(() => loadContent(withExtra({ devices: [device] }))).toThrow(/declared verified but/);
  });

  it("rejects a verified claim whose source has no revision or date", () => {
    const source = { ...realSource, id: "undated", documentRevision: undefined };
    const device = { ...realDevice, terminals: [{ ...verifiedTerminal, sourceRefs: [{ sourceId: "undated" }] }] };
    expect(() => loadContent(withExtra({ sources: [source], devices: [device] }))).toThrow(/no document revision/);
  });

  it("rejects a source URL without the date it was confirmed", () => {
    const source = { ...realSource, id: "linked", url: "https://example.com/manual.pdf" };
    expect(() => loadContent(withExtra({ sources: [source] }))).toThrow(/accessedDate/);
  });
});

describe("demo separation", () => {
  it("rejects real devices citing demonstration sources", () => {
    const device = { ...realDevice, documentation: [{ sourceId: "demo-ng-ap8-install" }] };
    expect(() => loadContent(withExtra({ devices: [device] }))).toThrow(/cites demonstration source/);
  });

  it("rejects real devices or claims declared as demonstration", () => {
    expect(() => loadContent(withExtra({ devices: [{ ...realDevice, verification: { status: "demonstration" } }] }))).toThrow(
      /real devices cannot be declared/,
    );
    const claim = { ...realDevice, terminals: [{ label: "A", function: "B", status: "demonstration" }] };
    expect(() => loadContent(withExtra({ devices: [claim] }))).toThrow(/cannot carry demonstration claims/);
  });

  it("rejects demonstration wiring or workflows linked to real devices", () => {
    const wiring = {
      id: "bad-demo-wiring",
      title: "Bad",
      summary: "Bad",
      inputType: "single-eol",
      arrangement: { key: "nc-alarm", label: "NC alarm" },
      circuit: {
        terminals: { a: { label: "Z" }, b: { label: "COM" } },
        network: { kind: "series", children: [{ kind: "contact", id: "ALM", function: "alarm", type: "NC" }, { kind: "resistor", id: "R1", ohms: 2200, role: "end-of-line" }] },
      },
      states: [{ id: "normal", kind: "normal", contacts: { ALM: "closed" } }],
      appliesToDeviceIds: ["real-device"],
      isDemo: true,
      verification: { status: "demonstration" },
      updatedAt: "2026-01-01",
    };
    expect(() => loadContent(withExtra({ devices: [realDevice], wiring: [wiring] }))).toThrow(/demonstration records cannot link real device/);
  });
});

describe("structural validation", () => {
  it("rejects references to unknown sources, manufacturers and variants", () => {
    const device = {
      ...realDevice,
      manufacturerId: "nope",
      documentation: [{ sourceId: "missing" }],
      terminals: [{ label: "A", function: "B", appliesToVariantIds: ["ghost"] }],
    };
    expect(() => loadContent(withExtra({ devices: [device] }))).toThrow(/unknown manufacturerId[\s\S]*unknown source[\s\S]*unknown variant/);
  });

  it("rejects real wiring declared verified when the circuit evidence is incomplete", () => {
    const wiring = {
      id: "real-wiring",
      title: "Real",
      summary: "Real",
      panelDeviceId: "real-panel",
      inputType: "single-eol",
      arrangement: { key: "nc-alarm", label: "NC alarm" },
      circuit: {
        terminals: { a: { label: "Z" }, b: { label: "COM" } },
        network: { kind: "series", children: [{ kind: "contact", id: "ALM", function: "alarm", type: "NC" }, { kind: "resistor", id: "R1", ohms: 2200, role: "end-of-line" }] },
      },
      states: [
        { id: "normal", kind: "normal", contacts: { ALM: "closed" } },
        { id: "alarm", kind: "alarm", contacts: { ALM: "open" } },
      ],
      verification: { status: "verified", review },
      sourceRefs: [{ sourceId: "real-manual" }],
      appliesToRevisions: ["Rev B"],
      updatedAt: "2026-01-01",
    };
    const panel = { ...realDevice, id: "real-panel", category: "alarm-panel" };
    expect(() => loadContent(withExtra({ devices: [panel], wiring: [wiring] }))).toThrow(
      /wiring real-wiring: declared verified but[\s\S]*panel terminal assignments not documented/,
    );
  });

  it("rejects unknown categories and duplicate ids", () => {
    expect(() => loadContent(withExtra({ devices: [{ ...realDevice, category: "toaster" }] }))).toThrow(ContentValidationError);
    expect(() => loadContent(withExtra({ devices: [realDevice, realDevice] }))).toThrow(/duplicate id/);
  });
});
