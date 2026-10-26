import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDevice, listDeviceIds, type CitedSource, type DeviceDetail, type RelatedRecord } from "@/lib/content/repository";
import type { Specification } from "@/lib/content/schema";
import { BackToLibrary } from "@/components/devices/BackToLibrary";
import { ClaimMeta, SectionEvidence, sharedStatus } from "@/components/devices/ClaimMeta";
import { sharedDocument, sharedSources } from "@/components/devices/Citation";
import { DeviceSection, SectionNav, type SectionLink } from "@/components/devices/DeviceSection";
import { DOC_TYPE_LABELS, DocumentList } from "@/components/devices/DocumentList";
import { FavouriteButton } from "@/components/devices/FavouriteButton";
import { RecordView } from "@/components/devices/RecordView";
import { Icon } from "@/components/ui/Icon";
import { StatusPanel } from "@/components/ui/StatusPanel";
import { VerificationBadge } from "@/components/ui/VerificationBadge";

type Props = { params: Promise<{ id: string }> };

export async function generateStaticParams() {
  return (await listDeviceIds()).map((id) => ({ id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const device = await getDevice((await params).id);
  return { title: device ? `${device.model} · ${device.manufacturer.name}` : "Device not found" };
}

const SPEC_GROUP_LABELS: Record<Specification["group"], string> = {
  electrical: "Electrical",
  communications: "Communications",
  physical: "Physical",
  environmental: "Environmental",
  other: "Other",
};


/** Preference order for the one-tap "open manufacturer document" button. */
const DOC_PRIORITY: CitedSource["documentType"][] = ["installation-manual", "datasheet", "wiring-guide", "programming-manual", "product-page"];

function primaryDocument(docs: CitedSource[]): CitedSource | undefined {
  const linked = docs.filter((d) => d.url);
  return DOC_PRIORITY.map((t) => linked.find((d) => d.documentType === t)).find(Boolean) ?? linked[0];
}

const STATUS_EXPLANATION: Record<DeviceDetail["status"], string> = {
  verified: "Every item on this page has been checked by a named reviewer against the cited manufacturer documents.",
  "needs-verification":
    "Not yet verified against manufacturer documentation. Don't treat anything here as installation instructions — confirm with the manufacturer's manual.",
  demonstration: "Fictional demonstration record for development. Never use on site.",
};

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function SubHeading({ children, first = false }: { children: React.ReactNode; first?: boolean }) {
  return (
    <h3 className={`px-4 pt-3 font-mono text-[11px] tracking-[0.16em] text-fg-subtle uppercase ${first ? "" : "border-t border-line"}`}>
      {children}
    </h3>
  );
}

function RelatedList({ items, empty, toolHref, toolLabel }: { items: RelatedRecord[]; empty: string; toolHref: string; toolLabel: string }) {
  if (items.length === 0) {
    return (
      <div className="px-4 pt-1 pb-4 text-sm leading-relaxed text-fg-muted">
        <p>{empty}</p>
        <Link href={toolHref} className="mt-1 inline-flex h-10 items-center gap-1 font-medium text-signal-400 hover:text-signal-300">
          Browse {toolLabel}
          <Icon name="chevron-right" className="size-4" />
        </Link>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-line">
      {items.map((r) => (
        <li key={r.id}>
          <Link href={r.href} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-ink-850 active:bg-ink-800">
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] text-fg">{r.title}</span>
              <span className="mt-1 flex flex-wrap items-center gap-2">
                <VerificationBadge status={r.status} />
                <span className="text-xs text-fg-subtle">{r.reason}</span>
              </span>
            </span>
            <Icon name="chevron-right" className="size-4 shrink-0 text-fg-subtle" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function DevicePage({ params }: Props) {
  const device = await getDevice((await params).id);
  if (!device) notFound();

  const { power, terminals, specifications, installationNotes, commissioningNotes, variants, lifecycle, documents, related } = device;
  const notes = [...installationNotes, ...commissioningNotes];
  const isPanel = device.category === "alarm-panel";
  // Field references (verified first, from the repository's ordering) are kept apart from demonstrations.
  const fieldWiring = related.wiring.filter((w) => w.status !== "demonstration");
  const demoWiring = related.wiring.filter((w) => w.status === "demonstration");
  const primaryDoc = primaryDocument(documents);

  // Show status/sources once per section when every item agrees, otherwise per item.
  const terminalStatus = sharedStatus(terminals);
  const terminalSources = sharedSources(terminals);
  // Same document, different pages: name the document once, show pages per row.
  const terminalDocument = terminalSources ? null : sharedDocument(terminals);
  const specStatus = sharedStatus(specifications);
  const specSources = sharedSources(specifications);
  const specGroups = Object.entries(Object.groupBy(specifications, (s) => s.group)) as [Specification["group"], typeof specifications][];

  const missing = [
    !power && "power requirements",
    terminals.length === 0 && "terminal assignments",
    specifications.length === 0 && "technical specifications",
    notes.length === 0 && "installation and commissioning notes",
  ].filter((x): x is string => Boolean(x));

  const sections: SectionLink[] = [
    { id: "identification", label: "Model" },
    power && { id: "power", label: "Power" },
    terminals.length > 0 && { id: "terminals", label: "Terminals" },
    specifications.length > 0 && { id: "specifications", label: "Specs" },
    notes.length > 0 && { id: "notes", label: "Install notes" },
    { id: "documents", label: "Manuals" },
    { id: "related", label: "Wiring & faults" },
  ].filter((x): x is SectionLink => Boolean(x));

  return (
    <article className="flex flex-col gap-4">
      <RecordView deviceId={device.id} />
      <div>
        <BackToLibrary />
      </div>

      <header>
        <p className="text-sm text-fg-muted">
          <Link href={`/devices?manufacturer=${device.manufacturer.id}`} className="hover:text-fg">
            {device.manufacturer.name}
          </Link>{" "}
          · {device.categoryLabel}
        </p>
        <h1 className="mt-1 font-mono text-3xl font-medium tracking-tight break-words text-fg">{device.model}</h1>
        <p className="mt-1 text-lg text-fg">{device.name}</p>
        {device.description && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-fg-muted">{device.description}</p>}
        <div className="mt-4 flex flex-col gap-2 min-[420px]:flex-row min-[420px]:flex-wrap">
          {primaryDoc?.url && (
            <a
              href={primaryDoc.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-signal-500 px-4 text-sm font-semibold text-ink-950 hover:bg-signal-400"
            >
              Open {DOC_TYPE_LABELS[primaryDoc.documentType].toLowerCase()}
              <Icon name="external" className="size-4" />
            </a>
          )}
          <FavouriteButton deviceId={device.id} />
        </div>
      </header>

      <StatusPanel
        status={device.status}
        explanation={STATUS_EXPLANATION[device.status]}
        updatedAt={device.updatedAt}
        review={device.review}
        notes={device.statusNotes}
      />

      {lifecycle?.state === "discontinued" && (
        <section aria-label="Product lifecycle" className="rounded-xl border border-line-strong bg-ink-850 px-4 py-3 text-sm leading-relaxed">
          <p className="font-semibold text-fg">
            Discontinued by the manufacturer{lifecycle.discontinuedOn && ` on ${formatDate(lifecycle.discontinuedOn)}`}
          </p>
          {lifecycle.replacedBy.length > 0 && (
            <p className="mt-1 text-fg-muted">
              Replacement{lifecycle.replacedBy.length > 1 ? " options" : ""}: <span className="text-fg">{lifecycle.replacedBy.join(", ")}</span>
            </p>
          )}
          {lifecycle.supportUntil && <p className="mt-1 text-fg-muted">Manufacturer support until {formatDate(lifecycle.supportUntil)}</p>}
          {lifecycle.notes && <p className="mt-1 text-fg-muted">{lifecycle.notes}</p>}
          <ClaimMeta claim={lifecycle} showStatus={lifecycle.status !== device.status} showSources />
        </section>
      )}

      <SectionNav links={sections} />

      <DeviceSection id="identification" title="Model identification">
        <dl className="divide-y divide-line">
          <div className="grid gap-0.5 px-4 py-2.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-sm text-fg-muted">Manufacturer</dt>
            <dd className="text-[15px] text-fg">
              {device.manufacturer.name}
              {device.manufacturer.parentCompany && <span className="text-fg-muted"> ({device.manufacturer.parentCompany})</span>}
            </dd>
          </div>
          <div className="grid gap-0.5 px-4 py-2.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-sm text-fg-muted">Model</dt>
            <dd className="font-mono text-[15px] text-fg">{device.model}</dd>
          </div>
          <div className="grid gap-0.5 px-4 py-2.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-sm text-fg-muted">Category</dt>
            <dd className="text-[15px] text-fg">{device.categoryLabel}</dd>
          </div>
          {device.aliases.length > 0 && (
            <div className="grid gap-0.5 px-4 py-2.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
              <dt className="text-sm text-fg-muted">Also known as</dt>
              <dd className="text-[15px] text-fg">{device.aliases.join(", ")}</dd>
            </div>
          )}
        </dl>
        <SubHeading>Variants & revisions</SubHeading>
        {variants.length === 0 ? (
          <p className="px-4 pt-1 pb-4 text-sm text-fg-muted">
            Part numbers and hardware revisions have not been recorded yet. Check the label on the device and the
            manufacturer&apos;s documentation.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {variants.map((v) => (
              <li key={v.id} className="px-4 py-3">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[15px] text-fg">{v.name}</span>
                  {v.partNumber && <span className="font-mono text-sm text-signal-300">{v.partNumber}</span>}
                </span>
                {v.description && <span className="mt-0.5 block text-sm text-fg-muted">{v.description}</span>}
                {v.hardwareRevisions.length > 0 && (
                  <span className="mt-1 block text-sm text-fg-muted">
                    {v.hardwareRevisions.map((r) => [r.revision, r.firmware && `firmware ${r.firmware}`, r.notes].filter(Boolean).join(" · ")).join("; ")}
                  </span>
                )}
                <ClaimMeta claim={v} showStatus={v.status !== device.status} showSources />
              </li>
            ))}
          </ul>
        )}
      </DeviceSection>

      {power && (
        <DeviceSection id="power" title="Power requirements">
          <dl className="grid grid-cols-1 gap-px bg-line min-[420px]:grid-cols-2">
            {power.supplyVoltage && (
              <div className="bg-ink-900 px-4 py-3">
                <dt className="text-xs text-fg-muted">Supply voltage</dt>
                <dd className="mt-0.5 font-mono text-[15px] text-fg">
                  {power.supplyVoltage.min}–{power.supplyVoltage.max} V {power.supplyVoltage.type}
                  {power.supplyVoltage.nominal ? <span className="text-fg-muted"> · nom. {power.supplyVoltage.nominal} V</span> : null}
                </dd>
              </div>
            )}
            {power.currentDrawMa && (power.currentDrawMa.standby !== undefined || power.currentDrawMa.alarm !== undefined) && (
              <div className="bg-ink-900 px-4 py-3">
                <dt className="text-xs text-fg-muted">Current draw (standby / alarm)</dt>
                <dd className="mt-0.5 font-mono text-[15px] text-fg">
                  {power.currentDrawMa.standby ?? "—"} / {power.currentDrawMa.alarm ?? "—"} mA
                </dd>
              </div>
            )}
            {power.powerOverEthernet && (
              <div className="bg-ink-900 px-4 py-3">
                <dt className="text-xs text-fg-muted">Power over Ethernet</dt>
                <dd className="mt-0.5 font-mono text-[15px] text-fg">{power.powerOverEthernet}</dd>
              </div>
            )}
          </dl>
          <div className="border-t border-line px-4 py-2.5">
            {power.notes && <p className="text-sm text-fg-muted">{power.notes}</p>}
            <ClaimMeta claim={power} showStatus showSources />
          </div>
        </DeviceSection>
      )}

      {terminals.length > 0 && (
        <DeviceSection id="terminals" title="Terminals" aside={<span className="font-mono text-xs text-fg-subtle">{terminals.length}</span>}>
          <ul className="divide-y divide-line">
            {terminals.map((t) => (
              <li key={t.label} className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
                <span className="font-mono text-[15px] break-words text-signal-300">{t.label}</span>
                <span>
                  <span className="block text-[15px] text-fg">{t.function}</span>
                  {t.notes && <span className="mt-0.5 block text-sm text-fg-muted">{t.notes}</span>}
                  <ClaimMeta claim={t} showStatus={!terminalStatus} showSources={!terminalSources} locatorOnly={Boolean(terminalDocument)} />
                </span>
              </li>
            ))}
          </ul>
          <SectionEvidence sources={terminalSources ?? (terminalDocument && [terminalDocument])} status={terminalStatus} />
        </DeviceSection>
      )}

      {specifications.length > 0 && (
        <DeviceSection id="specifications" title="Specifications">
          {specGroups.map(([group, specs], i) => (
            <div key={group}>
              <SubHeading first={i === 0}>{SPEC_GROUP_LABELS[group]}</SubHeading>
              <dl className="divide-y divide-line">
                {specs.map((s) => (
                  <div key={s.label} className="grid gap-0.5 px-4 py-2.5 sm:grid-cols-[12rem_1fr] sm:gap-4">
                    <dt className="text-sm text-fg-muted">{s.label}</dt>
                    <dd>
                      <span className="block font-mono text-[15px] text-fg">{s.value}</span>
                      <ClaimMeta claim={s} showStatus={!specStatus} showSources={!specSources} />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
          <SectionEvidence sources={specSources} status={specStatus} />
        </DeviceSection>
      )}

      {notes.length > 0 && (
        <DeviceSection id="notes" title="Installation & commissioning">
          {[
            ["Installation", installationNotes],
            ["Commissioning", commissioningNotes],
          ].map(([label, list]) =>
            (list as typeof notes).length === 0 ? null : (
              <div key={label as string}>
                <SubHeading first>{label as string}</SubHeading>
                <ul className="flex flex-col gap-2 p-3">
                  {(list as typeof notes).map((n) => (
                    <li
                      key={n.text}
                      className={`flex gap-3 rounded-xl border px-3 py-3 ${
                        n.severity === "caution" ? "border-unverified/30 bg-unverified/[0.06]" : "border-line bg-ink-850"
                      }`}
                    >
                      <Icon
                        name={n.severity === "caution" ? "alert" : "shield"}
                        className={`mt-0.5 size-4 shrink-0 ${n.severity === "caution" ? "text-unverified" : "text-fg-subtle"}`}
                      />
                      <span>
                        <span className="block text-[15px] leading-relaxed text-fg">{n.text}</span>
                        <ClaimMeta claim={n} showStatus showSources />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ),
          )}
        </DeviceSection>
      )}

      {missing.length > 0 && (
        <section aria-label="Not yet documented" className="rounded-2xl border border-dashed border-line-strong px-4 py-4 text-sm leading-relaxed text-fg-muted">
          <p className="font-medium text-fg">Not yet documented in Fieldwise</p>
          <p className="mt-1">
            We haven&apos;t added verified {missing.join(", ")} for this device yet.{" "}
            {documents.some((d) => d.url) ? "Use the manufacturer's documentation below" : "Use the manufacturer's current documentation"}{" "}
            — never guess terminal assignments or supply requirements.
          </p>
        </section>
      )}

      <DeviceSection id="documents" title="Manufacturer documentation">
        <DocumentList
          documents={documents}
          empty="No manufacturer documents have been linked yet. Check the manufacturer's website or partner portal."
        />
      </DeviceSection>

      <DeviceSection id="related" title="Wiring & troubleshooting">
        <SubHeading first>Wiring configurations</SubHeading>
        {isPanel && (
          <div className="px-4 pt-2">
            <Link
              href={`/eol?panel=${device.id}`}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-signal-500/50 bg-signal-500/10 px-4 text-sm font-semibold text-signal-300 hover:bg-signal-500/15 min-[420px]:w-auto"
            >
              <Icon name="eol" className="size-4" />
              Open in EOL Wiring Assistant
            </Link>
          </div>
        )}
        {fieldWiring.length > 0 || demoWiring.length === 0 ? (
          <RelatedList
            items={fieldWiring}
            empty={
              isPanel
                ? "No verified configurations available for this panel yet. They are added only once backed by the manufacturer's documentation and reviewed."
                : "No wiring configurations are linked to this device yet. Only configurations backed by manufacturer documentation will be added."
            }
            toolHref="/eol"
            toolLabel="the EOL Wiring Assistant"
          />
        ) : null}
        {demoWiring.length > 0 && (
          <div className="mx-3 mb-3 rounded-xl border-2 border-dashed border-example/40">
            <p className="px-3 pt-2.5 font-mono text-[11px] font-semibold tracking-[0.12em] text-example uppercase">Demonstration — not field references</p>
            <RelatedList items={demoWiring} empty="" toolHref="/eol" toolLabel="" />
          </div>
        )}
        <SubHeading>Troubleshooting workflows</SubHeading>
        <RelatedList
          items={related.workflows}
          empty="No troubleshooting workflows apply to this device yet."
          toolHref="/fault-finder"
          toolLabel="troubleshooting workflows"
        />
      </DeviceSection>
    </article>
  );
}
