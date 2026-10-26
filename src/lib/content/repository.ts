/**
 * Read-only data access for technical content.
 *
 * UI code must use these async functions rather than importing content, so
 * the store can move from local JSON to Supabase without frontend changes.
 * Results are plain, serialisable view models with effective verification
 * statuses already resolved — components never decide what is "verified".
 *
 * Demonstration records are excluded unless demo mode is enabled.
 */
import { rawContent } from "@content/index";
import { isDemoModeEnabled } from "@/lib/config";
import { loadContent, type ContentStore } from "./loader";
import {
  CATEGORY_LABELS,
  groupForCategory,
  type CategoryGroupId,
  type Device,
  type DeviceCategory,
  type DeviceNote,
  type EolPreset,
  type Lifecycle,
  type Manufacturer,
  type Power,
  type Review,
  type Source,
  type SourceRef,
  type Specification,
  type Terminal,
  type TroubleshootingWorkflow,
  type Variant,
  type VerificationStatus,
  type WiringConfiguration,
} from "./schema";
import { resolveStatus, weakestStatus, type ClaimEvidence } from "./verification";
import { circuitComponents, resistorCode } from "@/lib/eol/engine";
import type { Circuit } from "@/lib/eol/model";
import { analyseCircuit, wiringVerificationGaps, type Diagnostic, type StateEvaluation } from "@/lib/eol/validate";
import { classifyCircuit, isElectricallyValid, type CircuitClassification } from "@/lib/eol/classification";

let store: ContentStore | null = null;

function getStore(): ContentStore {
  store ??= loadContent(rawContent);
  return store;
}

/* ------------------------------------------------------------- view models */

export interface CitedSource {
  id: string;
  title: string;
  publisher: string;
  documentType: Source["documentType"];
  documentNumber?: string;
  documentRevision?: string;
  publishedDate?: string;
  url?: string;
  accessedDate?: string;
  isDemo: boolean;
  locator?: string;
}

/** A technical claim with evidence resolved for display. */
export type ResolvedClaim<T> = Omit<T, "status" | "sourceRefs" | "review" | "appliesToVariantIds"> & {
  status: VerificationStatus;
  /** Why a declared "verified" was not honoured. */
  statusReasons: string[];
  sources: CitedSource[];
  appliesToVariants: string[];
  appliesToRevisions: string[];
  review?: Review;
};

export interface RelatedRecord {
  id: string;
  title: string;
  href: string;
  status: VerificationStatus;
  /** Why the record is related, e.g. "Applies to IP camera". */
  reason: string;
}

export interface ManufacturerSummary {
  id: string;
  name: string;
  isDemo: boolean;
}

export interface DeviceDetail {
  id: string;
  model: string;
  name: string;
  category: DeviceCategory;
  categoryLabel: string;
  description?: string;
  aliases: string[];
  manufacturer: ManufacturerSummary & { website?: string; country?: string; parentCompany?: string };
  status: VerificationStatus;
  statusNotes?: string;
  review?: Review;
  isDemo: boolean;
  updatedAt: string;
  variants: ResolvedClaim<Variant>[];
  lifecycle?: ResolvedClaim<Lifecycle>;
  terminals: ResolvedClaim<Terminal>[];
  power?: ResolvedClaim<Power>;
  specifications: ResolvedClaim<Specification>[];
  installationNotes: ResolvedClaim<DeviceNote>[];
  commissioningNotes: ResolvedClaim<DeviceNote>[];
  documents: CitedSource[];
  related: { wiring: RelatedRecord[]; workflows: RelatedRecord[] };
}

/** Lightweight device projection for lists and search (safe for the client). */
export interface DeviceListItem {
  id: string;
  model: string;
  name: string;
  category: DeviceCategory;
  group: CategoryGroupId;
  manufacturerId: string;
  manufacturerName: string;
  status: VerificationStatus;
  discontinued: boolean;
  /** Aliases, part numbers and other terms technicians search by. */
  keywords: string[];
}

export interface LinkedRecordDetail {
  id: string;
  title: string;
  summary: string;
  status: VerificationStatus;
  statusNotes?: string;
  statusReasons: string[];
  review?: Review;
  isDemo: boolean;
  updatedAt: string;
  sources: CitedSource[];
  appliesToRevisions: string[];
  devices: { id: string; model: string; manufacturerName: string; status: VerificationStatus }[];
}

export interface PanelSummary {
  id: string;
  model: string;
  name: string;
  manufacturerName: string;
  status: VerificationStatus;
  isDemo: boolean;
}

/** A wiring configuration as listed in the assistant and on device pages. */
export interface WiringSummary {
  id: string;
  title: string;
  summary: string;
  status: VerificationStatus;
  isDemo: boolean;
  /** Generic demonstration input: not tied to any panel or device. */
  generic: boolean;
  panel: PanelSummary | null;
  inputType: WiringConfiguration["inputType"];
  arrangement: WiringConfiguration["arrangement"];
  /** e.g. "4k7 EOL / 2k2 alarm". */
  configurationLabel: string;
  /** Short name in the explorer's arrangement picker, e.g. "DEOL". */
  shortLabel: string;
  devices: LinkedRecordDetail["devices"];
}

export interface WiringDetail extends WiringSummary {
  /** Electrical validity and manufacturer confirmation, kept separate. */
  classification: CircuitClassification;
  electricallyValid: boolean;
  statusNotes?: string;
  statusReasons: string[];
  review?: Review;
  updatedAt: string;
  notes?: string;
  circuit: Circuit;
  states: StateEvaluation[];
  diagnostics: Diagnostic[];
  interpretation?: { text: string; sources: CitedSource[] };
  panelHardwareRevisions: string[];
  panelFirmwareRevisions: string[];
  appliesToRevisions: string[];
  appliesToVariants: { deviceId: string; model: string; variant: string }[];
  /** Every document cited anywhere in the configuration, de-duplicated. */
  sources: CitedSource[];
}

/** A panel as offered in the assistant's first step. */
export interface EolPanelOption extends PanelSummary {
  configurationCount: number;
  verifiedCount: number;
}

export type WorkflowDetail = LinkedRecordDetail &
  Pick<TroubleshootingWorkflow, "faultArea" | "symptoms" | "outline"> & { categories: DeviceCategory[] };

/* ---------------------------------------------------------------- helpers */

function visible<T extends { isDemo: boolean }>(items: T[]): T[] {
  return isDemoModeEnabled() ? items : items.filter((i) => !i.isDemo);
}

function manufacturerFor(d: Device): Manufacturer | undefined {
  return getStore().manufacturers.find((m) => m.id === d.manufacturerId);
}

function deviceIsDemo(d: Device): boolean {
  return manufacturerFor(d)?.isDemo ?? false;
}

function visibleDevices(): Device[] {
  const devices = getStore().devices;
  return isDemoModeEnabled() ? devices : devices.filter((d) => !deviceIsDemo(d));
}

function sourceById(id: string): Source | undefined {
  return getStore().sources.find((s) => s.id === id);
}

function cite(refs: SourceRef[]): CitedSource[] {
  return refs.flatMap((ref) => {
    const s = sourceById(ref.sourceId);
    if (!s) return [];
    return [
      {
        id: s.id,
        title: s.title,
        publisher: s.publisher,
        documentType: s.documentType,
        documentNumber: s.documentNumber,
        documentRevision: s.documentRevision,
        publishedDate: s.publishedDate,
        url: s.url,
        accessedDate: s.accessedDate,
        isDemo: s.isDemo,
        locator: ref.locator,
      },
    ];
  });
}

function byModel(a: { model: string }, b: { model: string }) {
  return a.model.localeCompare(b.model, undefined, { numeric: true });
}

function resolveClaim<T extends ClaimEvidence & { appliesToVariantIds?: string[] }>(claim: T, d: Device): ResolvedClaim<T> {
  const { status: _declared, sourceRefs, review, appliesToVariantIds = [], ...rest } = claim;
  const resolved = resolveStatus(claim, {
    recordStatus: d.verification.status,
    recordReview: d.verification.review,
    isDemo: deviceIsDemo(d),
    getSource: sourceById,
  });
  return {
    ...rest,
    status: resolved.status,
    statusReasons: resolved.reasons,
    sources: cite(sourceRefs),
    appliesToVariants: appliesToVariantIds.map((id) => d.variants.find((v) => v.id === id)?.name ?? id),
    appliesToRevisions: claim.appliesToRevisions,
    review: review ?? (resolved.status === "verified" ? d.verification.review : undefined),
  } as ResolvedClaim<T>;
}

function deviceStatus(d: Device, claimStatuses: VerificationStatus[]): VerificationStatus {
  if (deviceIsDemo(d)) return "demonstration";
  // A device is only "verified" overall if its record is reviewed and every claim on it is verified.
  const record = resolveStatus(
    { sourceRefs: d.documentation, appliesToRevisions: d.variants.flatMap((v) => v.hardwareRevisions.map((r) => r.revision)) },
    { recordStatus: d.verification.status, recordReview: d.verification.review, isDemo: false, getSource: sourceById },
  );
  if (claimStatuses.length === 0) return record.status === "verified" ? "needs-verification" : record.status;
  return weakestStatus([record.status, ...claimStatuses]);
}

function toListItem(d: Device): DeviceListItem {
  const m = manufacturerFor(d);
  const claims = [...d.variants, ...(d.lifecycle ? [d.lifecycle] : []), ...d.terminals, ...(d.power ? [d.power] : []), ...d.specifications, ...d.notes];
  return {
    id: d.id,
    model: d.model,
    name: d.name,
    category: d.category,
    group: groupForCategory(d.category),
    manufacturerId: d.manufacturerId,
    manufacturerName: m?.name ?? "Unknown manufacturer",
    status: deviceStatus(d, claims.map((c) => resolveClaim(c, d).status)),
    discontinued: d.lifecycle?.state === "discontinued",
    keywords: [
      ...d.aliases,
      CATEGORY_LABELS[d.category],
      ...d.variants.flatMap((v) => [v.name, v.partNumber ?? ""]).filter(Boolean),
    ],
  };
}

function recordStatus(r: WiringConfiguration | TroubleshootingWorkflow) {
  return resolveStatus(
    { sourceRefs: r.sourceRefs, appliesToRevisions: r.appliesToRevisions },
    { recordStatus: r.verification.status, recordReview: r.verification.review, isDemo: r.isDemo, getSource: sourceById },
  );
}

function linkedDevices(ids: string[]) {
  const shown = new Map(visibleDevices().map((d) => [d.id, d]));
  return ids.flatMap((id) => {
    const d = shown.get(id);
    if (!d) return [];
    const item = toListItem(d);
    return [{ id: d.id, model: d.model, manufacturerName: item.manufacturerName, status: item.status }];
  });
}

/** Generic demonstration circuits are not tied to any device, so they never mislead about a real product. */
function isGenericDemo(w: WiringConfiguration) {
  return w.isDemo && !w.panelDeviceId && w.appliesToDeviceIds.length === 0;
}

function visibleWiring(): WiringConfiguration[] {
  return getStore().wiring.filter((w) => !w.isDemo || isDemoModeEnabled() || isGenericDemo(w));
}

/** Effective status: generic evidence rules AND the wiring-specific gaps must both pass. */
function wiringStatus(w: WiringConfiguration) {
  const analysis = analyseCircuit(w);
  const resolved = recordStatus(w);
  if (resolved.status !== "verified") return { status: resolved.status, reasons: resolved.reasons, analysis };
  const gaps = wiringVerificationGaps(w, analysis, sourceById);
  return gaps.length > 0 ? { status: "needs-verification" as const, reasons: gaps, analysis } : { status: resolved.status, reasons: [], analysis };
}

function panelSummary(d: Device): PanelSummary {
  const item = toListItem(d);
  return { id: d.id, model: d.model, name: d.name, manufacturerName: item.manufacturerName, status: item.status, isDemo: deviceIsDemo(d) };
}

function defaultConfigurationLabel(w: WiringConfiguration): string {
  const resistors = circuitComponents(w.circuit.network).filter((c) => c.kind === "resistor");
  if (resistors.length === 0) return "No EOL resistor";
  const role = { "end-of-line": "EOL", alarm: "alarm", tamper: "tamper", other: "" } as const;
  return resistors.map((r) => [r.ohms === null ? "?" : resistorCode(r.ohms), role[r.role]].filter(Boolean).join(" ")).join(" / ");
}

function toWiringSummary(w: WiringConfiguration, status = wiringStatus(w).status): WiringSummary {
  const panel = w.panelDeviceId ? visibleDevices().find((d) => d.id === w.panelDeviceId) : undefined;
  return {
    id: w.id,
    title: w.title,
    summary: w.summary,
    status,
    isDemo: w.isDemo,
    generic: isGenericDemo(w),
    panel: panel ? panelSummary(panel) : null,
    inputType: w.inputType,
    arrangement: w.arrangement,
    configurationLabel: w.configurationLabel ?? defaultConfigurationLabel(w),
    shortLabel: w.shortLabel ?? w.configurationLabel ?? defaultConfigurationLabel(w),
    devices: linkedDevices(w.appliesToDeviceIds),
  };
}

/** Verified first, then needs verification, then demonstration; DEOL before other input types. */
function wiringOrder(a: WiringSummary, b: WiringSummary) {
  const rank = { verified: 0, "needs-verification": 1, demonstration: 2 } as const;
  const deol = (w: WiringSummary) => (w.inputType === "double-eol" ? 0 : 1);
  return rank[a.status] - rank[b.status] || deol(a) - deol(b) || a.title.localeCompare(b.title);
}

function toLinkedDetail(r: WiringConfiguration | TroubleshootingWorkflow): LinkedRecordDetail {
  const resolved = recordStatus(r);
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    status: resolved.status,
    statusNotes: r.verification.notes,
    statusReasons: resolved.reasons,
    review: resolved.status === "verified" ? r.verification.review : undefined,
    isDemo: r.isDemo,
    updatedAt: r.updatedAt,
    sources: cite(r.sourceRefs),
    appliesToRevisions: r.appliesToRevisions,
    devices: linkedDevices(r.appliesToDeviceIds),
  };
}

/* ------------------------------------------------------------- public API */

export async function listManufacturers(): Promise<ManufacturerSummary[]> {
  return visible(getStore().manufacturers)
    .map(({ id, name, isDemo }) => ({ id, name, isDemo }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getManufacturer(id: string): Promise<ManufacturerSummary | null> {
  return (await listManufacturers()).find((m) => m.id === id) ?? null;
}

export async function listDevices(): Promise<DeviceListItem[]> {
  return visibleDevices().map(toListItem).sort(byModel);
}

export async function listDeviceIds(): Promise<string[]> {
  return visibleDevices().map((d) => d.id);
}

export async function getDevice(id: string): Promise<DeviceDetail | null> {
  const d = visibleDevices().find((x) => x.id === id);
  if (!d) return null;
  const m = manufacturerFor(d);
  const variants = d.variants.map((v) => resolveClaim(v, d));
  const lifecycle = d.lifecycle ? resolveClaim(d.lifecycle, d) : undefined;
  const terminals = d.terminals.map((t) => resolveClaim(t, d));
  const power = d.power ? resolveClaim(d.power, d) : undefined;
  const specifications = d.specifications.map((s) => resolveClaim(s, d));
  const notes = d.notes.map((n) => resolveClaim(n, d));
  const allStatuses = [...variants, ...(lifecycle ? [lifecycle] : []), ...terminals, ...(power ? [power] : []), ...specifications, ...notes].map((c) => c.status);
  const status = deviceStatus(d, allStatuses);

  return {
    id: d.id,
    model: d.model,
    name: d.name,
    category: d.category,
    categoryLabel: CATEGORY_LABELS[d.category],
    description: d.description,
    aliases: d.aliases,
    manufacturer: {
      id: d.manufacturerId,
      name: m?.name ?? "Unknown manufacturer",
      isDemo: m?.isDemo ?? false,
      website: m?.website,
      country: m?.country,
      parentCompany: m?.parentCompany,
    },
    status,
    statusNotes: d.verification.notes,
    review: status === "verified" ? d.verification.review : undefined,
    isDemo: deviceIsDemo(d),
    updatedAt: d.updatedAt,
    variants,
    lifecycle,
    terminals,
    power,
    specifications,
    installationNotes: notes.filter((n) => n.kind === "installation"),
    commissioningNotes: notes.filter((n) => n.kind === "commissioning"),
    documents: cite(d.documentation),
    related: await getRelatedForDevice(d.id),
  };
}

/** Wiring configurations and workflows that declare they apply to a device (or its category). */
export async function getRelatedForDevice(deviceId: string): Promise<{ wiring: RelatedRecord[]; workflows: RelatedRecord[] }> {
  const d = visibleDevices().find((x) => x.id === deviceId);
  if (!d) return { wiring: [], workflows: [] };
  const wiring = visibleWiring()
    .filter((w) => w.panelDeviceId === d.id || w.appliesToDeviceIds.includes(d.id))
    .map((w) => toWiringSummary(w))
    .sort(wiringOrder)
    .map((w) => ({
      id: w.id,
      title: w.title,
      href: `/eol/${w.id}`,
      status: w.status,
      reason: w.panel?.id === d.id ? `${w.configurationLabel} · panel input` : `${w.configurationLabel} · ${w.panel?.model ?? "linked device"}`,
    }));
  const workflows = visible(getStore().workflows)
    .filter((w) => w.appliesToDeviceIds.includes(d.id) || w.appliesToCategories.includes(d.category))
    .map((w) => ({
      id: w.id,
      title: w.title,
      href: `/fault-finder/${w.id}`,
      status: recordStatus(w).status,
      reason: w.appliesToDeviceIds.includes(d.id) ? "Linked to this device" : `Applies to ${CATEGORY_LABELS[d.category]}`,
    }));
  return { wiring, workflows };
}

export async function listWiringConfigurations(): Promise<WiringSummary[]> {
  return visibleWiring().map((w) => toWiringSummary(w)).sort(wiringOrder);
}

export async function getWiringConfiguration(id: string): Promise<WiringDetail | null> {
  const w = visibleWiring().find((x) => x.id === id);
  if (!w) return null;
  const { status, reasons, analysis } = wiringStatus(w);
  const refs = [
    ...w.sourceRefs,
    ...w.circuit.terminals.a.sourceRefs,
    ...w.circuit.terminals.b.sourceRefs,
    ...circuitComponents(w.circuit.network).flatMap((c) => c.sourceRefs),
    ...w.states.flatMap((st) => st.documented?.sourceRefs ?? []),
    ...(w.interpretation?.sourceRefs ?? []),
  ];
  const seen = new Set<string>();
  const sources = cite(refs.map((r) => ({ sourceId: r.sourceId }))).filter((src) => !seen.has(src.id) && seen.add(src.id));
  return {
    ...toWiringSummary(w, status),
    classification: classifyCircuit({ analysis, manufacturerStatus: status, generic: isGenericDemo(w) }),
    electricallyValid: isElectricallyValid(analysis),
    statusNotes: w.verification.notes,
    statusReasons: reasons,
    review: status === "verified" ? w.verification.review : undefined,
    updatedAt: w.updatedAt,
    notes: w.notes,
    circuit: w.circuit,
    states: analysis.states,
    diagnostics: analysis.diagnostics,
    interpretation: w.interpretation && { text: w.interpretation.text, sources: cite(w.interpretation.sourceRefs) },
    panelHardwareRevisions: w.panelHardwareRevisions,
    panelFirmwareRevisions: w.panelFirmwareRevisions,
    appliesToRevisions: w.appliesToRevisions,
    appliesToVariants: w.appliesToVariants.flatMap((v) => {
      const d = visibleDevices().find((x) => x.id === v.deviceId);
      const variant = d?.variants.find((x) => x.id === v.variantId);
      return d && variant ? [{ deviceId: d.id, model: d.model, variant: variant.partNumber ?? variant.name }] : [];
    }),
    sources,
  };
}

/** Generic circuits for the explorer, in display order (DEOL first). */
export async function listGenericCircuits(): Promise<WiringDetail[]> {
  const ordered = visibleWiring()
    .filter(isGenericDemo)
    .sort((a, b) => (a.explorerOrder ?? 99) - (b.explorerOrder ?? 99) || a.title.localeCompare(b.title));
  const out: WiringDetail[] = [];
  for (const w of ordered) out.push((await getWiringConfiguration(w.id))!);
  return out;
}

export type { EolPreset };

export async function listEolPresets(): Promise<EolPreset[]> {
  return [...getStore().presets].sort((a, b) => a.order - b.order);
}

/** Panels offered in the assistant: every visible alarm panel, with how many configurations each has. */
export async function listEolPanels(): Promise<EolPanelOption[]> {
  const configs = await listWiringConfigurations();
  return visibleDevices()
    .filter((d) => d.category === "alarm-panel")
    .map((d) => {
      const own = configs.filter((c) => c.panel?.id === d.id);
      return { ...panelSummary(d), configurationCount: own.length, verifiedCount: own.filter((c) => c.status === "verified").length };
    })
    .sort((a, b) => b.verifiedCount - a.verifiedCount || a.manufacturerName.localeCompare(b.manufacturerName) || a.model.localeCompare(b.model));
}

export async function listWorkflows(): Promise<(LinkedRecordDetail & Pick<TroubleshootingWorkflow, "faultArea">)[]> {
  return visible(getStore().workflows).map((w) => ({ ...toLinkedDetail(w), faultArea: w.faultArea }));
}

export async function getWorkflow(id: string): Promise<WorkflowDetail | null> {
  const w = visible(getStore().workflows).find((x) => x.id === id);
  if (!w) return null;
  return {
    ...toLinkedDetail(w),
    faultArea: w.faultArea,
    symptoms: w.symptoms,
    outline: w.outline,
    categories: w.appliesToCategories,
  };
}

export async function getContentStats() {
  const devices = await listDevices();
  const count = (s: VerificationStatus) => devices.filter((d) => d.status === s).length;
  return {
    devices: devices.length,
    manufacturers: (await listManufacturers()).length,
    verified: count("verified"),
    needsVerification: count("needs-verification"),
    demonstration: count("demonstration"),
  };
}
