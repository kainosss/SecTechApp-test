import type { Circuit, CircuitNode, CircuitState } from "@/lib/eol/model";

export const R = (id: string, ohms: number | null, role: "end-of-line" | "alarm" | "tamper" | "other" = "other"): CircuitNode => ({
  kind: "resistor",
  id,
  ohms,
  role,
  sourceRefs: [],
});
export const C = (id: string, type: "NC" | "NO" = "NC", fn: "alarm" | "tamper" | "other" = "alarm"): CircuitNode => ({
  kind: "contact",
  id,
  type,
  function: fn,
  sourceRefs: [],
});
export const series = (...children: CircuitNode[]): CircuitNode => ({ kind: "series", children });
export const parallel = (...children: CircuitNode[]): CircuitNode => ({ kind: "parallel", children });

export const circuit = (network: CircuitNode): Circuit => ({
  terminals: { a: { label: "Z", sourceRefs: [] }, b: { label: "COM", sourceRefs: [] } },
  network,
});

export const state = (id: string, kind: CircuitState["kind"], contacts: Record<string, "open" | "closed"> = {}, line: CircuitState["line"] = "intact"): CircuitState => ({
  id,
  kind,
  line,
  contacts,
});

/** Dual EOL: alarm resistor across the NC alarm contact, EOL in series, NC tamper in series. */
export const deolNetwork = (eol = 4700, alarm = 2200) =>
  series(parallel(C("ALM"), R("RA", alarm, "alarm")), R("RE", eol, "end-of-line"), C("TMP", "NC", "tamper"));

export const deolStates: CircuitState[] = [
  state("normal", "normal", { ALM: "closed", TMP: "closed" }),
  state("alarm", "alarm", { ALM: "open", TMP: "closed" }),
  state("tamper", "tamper", { ALM: "closed", TMP: "open" }),
  state("cable-open", "cable-open", {}, "open"),
  state("cable-short", "cable-short", {}, "short"),
];

/** The same component, citing the given sources. */
export const cited = (node: CircuitNode, sourceRefs: { sourceId: string; locator?: string }[]): CircuitNode =>
  node.kind === "resistor" || node.kind === "contact" ? { ...node, sourceRefs } : node;
