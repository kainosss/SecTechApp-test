import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDevice, getDevices, getManufacturer, getRelatedForDevice, getSource, type RelatedRecord } from "@/lib/content/repository";
import { CATEGORY_LABELS, type Specification } from "@/lib/content/schema";
import { Citation, sharedRefs } from "@/components/devices/Citation";
import { DeviceSection, SectionNav, type SectionLink } from "@/components/devices/DeviceSection";
import { FavouriteButton } from "@/components/devices/FavouriteButton";
import { RecordView } from "@/components/devices/RecordView";
import { Icon } from "@/components/ui/Icon";
import { VerificationBadge } from "@/components/ui/VerificationBadge";

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
  return getDevices().map((d) => ({ id: d.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const device = getDevice((await params).id);
  return { title: device ? device.name : "Device not found" };
}

const SPEC_GROUP_LABELS: Record<Specification["group"], string> = {
  electrical: "Electrical",
  communications: "Communications",
  physical: "Physical",
  environmental: "Environmental",
  other: "Other",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  "installation-manual": "Installation manual",
  datasheet: "Datasheet",
  "programming-manual": "Programming manual",
  "wiring-guide": "Wiring guide",
  "technical-bulletin": "Technical bulletin",
  standard: "Standard",
  other: "Document",
};

function RelatedList({ items, empty, toolHref, toolLabel }: { items: RelatedRecord[]; empty: string; toolHref: string; toolLabel: string }) {
  if (items.length === 0) {
    return (
      <div className="px-4 py-4 text-sm leading-relaxed text-fg-muted">
        <p>{empty}</p>
        <Link href={toolHref} className="mt-2 inline-flex h-9 items-center gap-1 font-medium text-signal-400 hover:text-signal-300">
          Open {toolLabel}
          <Icon name="chevron-right" className="size-4" />
        </Link>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-line">
      {items.map((r) => (
        <li key={r.id}>
          <Link href={r.href} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-ink-850">
            <span className="min-w-0 flex-1 text-[15px] text-fg">{r.title}</span>
            <VerificationBadge status={r.status} />
            <Icon name="chevron-right" className="size-4 shrink-0 text-fg-subtle" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function DevicePage({ params }: Props) {
  const device = getDevice((await params).id);
  if (!device) notFound();
  const manufacturer = getManufacturer(device.manufacturerId);
  const related = getRelatedForDevice(device.id);
  const { status, notes, verifiedAt, verifiedBy } = device.verification;
  const v = device.power?.supplyVoltage;
  const current = device.power?.currentDrawMa;
  const hasElectrical = Boolean(device.power) || device.specifications.length > 0;

  const specGroups = Object.entries(
    Object.groupBy(device.specifications, (s) => s.group),
  ) as [Specification["group"], Specification[]][];

  const terminalRefs = sharedRefs(device.terminals);
  const specRefs = sharedRefs(device.specifications);

  const sections: SectionLink[] = [
    device.terminals.length > 0 && { id: "terminals", label: "Terminals" },
    hasElectrical && { id: "specifications", label: "Specs" },
    device.installationNotes.length > 0 && { id: "installation", label: "Install notes" },
    { id: "documents", label: "Manuals" },
    { id: "related", label: "Wiring & faults" },
    { id: "revisions", label: "Revisions" },
  ].filter((x): x is SectionLink => Boolean(x));

  return (
    <article className="flex flex-col gap-4">
      <RecordView deviceId={device.id} />
      <nav aria-label="Breadcrumb" className="text-sm text-fg-subtle">
        <Link href="/devices" className="hover:text-fg">
          Device Library
        </Link>
        <span className="mx-1.5">/</span>
        <Link href={`/devices?manufacturer=${device.manufacturerId}`} className="text-fg-muted hover:text-fg">
          {manufacturer?.name}
        </Link>
      </nav>

      <header>
        <p className="text-sm text-fg-muted">
          {manufacturer?.name} · {CATEGORY_LABELS[device.category]}
        </p>
        <h1 className="mt-1 font-mono text-3xl font-medium tracking-tight text-fg">{device.model}</h1>
        <p className="mt-1 text-lg text-fg">{device.name}</p>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-fg-muted">{device.summary}</p>
        <div className="mt-4">
          <FavouriteButton deviceId={device.id} />
        </div>
      </header>

      <div
        role="note"
        className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${
          status === "verified"
            ? "border-verified/30 bg-verified/5"
            : status === "example"
              ? "border-example/30 bg-example/[0.07]"
              : "border-unverified/30 bg-unverified/5"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <VerificationBadge status={status} />
          {verifiedAt && (
            <span className="text-xs text-fg-muted">
              Checked {verifiedAt} by {verifiedBy}
            </span>
          )}
          <span className="text-xs text-fg-subtle">Updated {device.updatedAt}</span>
        </div>
        {notes && <p className="mt-2 text-fg">{notes}</p>}
      </div>

      <SectionNav links={sections} />

      {device.terminals.length > 0 && (
        <DeviceSection id="terminals" title="Terminals" aside={<span className="font-mono text-xs text-fg-subtle">{device.terminals.length}</span>}>
          <ul className="divide-y divide-line">
            {device.terminals.map((t) => (
              <li key={t.label} className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
                <span className="font-mono text-[15px] text-signal-300">{t.label}</span>
                <span>
                  <span className="block text-[15px] text-fg">{t.function}</span>
                  {t.notes && <span className="mt-0.5 block text-sm text-fg-muted">{t.notes}</span>}
                  {!terminalRefs && <Citation refs={t.sourceRefs} className="mt-1" />}
                </span>
              </li>
            ))}
          </ul>
          {terminalRefs && <Citation refs={terminalRefs} className="border-t border-line px-4 py-2.5" />}
        </DeviceSection>
      )}

      {hasElectrical && (
        <DeviceSection id="specifications" title="Specifications">
          {device.power && (
            <div className="border-b border-line">
              <dl className="grid grid-cols-1 gap-px bg-line min-[420px]:grid-cols-2">
                {v && (
                  <div className="bg-ink-900 px-4 py-3">
                    <dt className="text-xs text-fg-muted">Supply voltage</dt>
                    <dd className="mt-0.5 font-mono text-[15px] text-fg">
                      {v.min}–{v.max} V {v.type}
                      {v.nominal ? <span className="text-fg-muted"> · nom. {v.nominal} V</span> : null}
                    </dd>
                  </div>
                )}
                {current && (current.standby !== undefined || current.alarm !== undefined) && (
                  <div className="bg-ink-900 px-4 py-3">
                    <dt className="text-xs text-fg-muted">Current draw (standby / alarm)</dt>
                    <dd className="mt-0.5 font-mono text-[15px] text-fg">
                      {current.standby ?? "—"} / {current.alarm ?? "—"} mA
                    </dd>
                  </div>
                )}
              </dl>
              <div className="bg-ink-900 px-4 py-2.5">
                {device.power.notes && <p className="text-sm text-fg-muted">{device.power.notes}</p>}
                <Citation refs={device.power.sourceRefs} />
              </div>
            </div>
          )}
          {specGroups.map(([group, specs]) => (
            <div key={group} className="border-b border-line last:border-b-0">
              <h3 className="px-4 pt-3 font-mono text-[11px] tracking-[0.16em] text-fg-subtle uppercase">{SPEC_GROUP_LABELS[group]}</h3>
              <dl className="divide-y divide-line">
                {specs.map((s) => (
                  <div key={s.label} className="grid gap-0.5 px-4 py-2.5 sm:grid-cols-[12rem_1fr] sm:gap-4">
                    <dt className="text-sm text-fg-muted">{s.label}</dt>
                    <dd>
                      <span className="block font-mono text-[15px] text-fg">{s.value}</span>
                      {!specRefs && <Citation refs={s.sourceRefs} />}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
          {specRefs && <Citation refs={specRefs} className="border-t border-line px-4 py-2.5" />}
        </DeviceSection>
      )}

      {device.installationNotes.length > 0 && (
        <DeviceSection id="installation" title="Installation notes">
          <ul className="flex flex-col gap-2 p-3">
            {device.installationNotes.map((n) => (
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
                  <Citation refs={n.sourceRefs} className="mt-1" />
                </span>
              </li>
            ))}
          </ul>
        </DeviceSection>
      )}

      <DeviceSection id="documents" title="Manufacturer documentation">
        <ul className="divide-y divide-line">
          {device.documentation.map((ref) => {
            const source = getSource(ref.sourceId);
            if (!source) return null;
            return (
              <li key={ref.sourceId} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[11px] tracking-wider text-fg-subtle uppercase">
                    {DOC_TYPE_LABELS[source.documentType]}
                    {source.documentRevision && ` · ${source.documentRevision}`}
                  </span>
                  <span className="mt-0.5 block text-[15px] text-fg">{source.title}</span>
                  <span className="block text-xs text-fg-muted">
                    {source.publisher}
                    {source.publishedDate && ` · Published ${source.publishedDate}`}
                    {source.accessedDate && ` · Accessed ${source.accessedDate}`}
                  </span>
                </span>
                {source.url ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-medium text-fg hover:bg-ink-850"
                  >
                    Open document
                    <Icon name="external" className="size-4" />
                  </a>
                ) : (
                  <span className="shrink-0 text-xs text-fg-subtle">
                    {source.isDemo ? "Demo document — no file" : "No public link"}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </DeviceSection>

      <DeviceSection id="related" title="Wiring & troubleshooting">
        <h3 className="px-4 pt-3 font-mono text-[11px] tracking-[0.16em] text-fg-subtle uppercase">EOL wiring configurations</h3>
        <RelatedList
          items={related.eolConfigurations}
          empty="No wiring configurations are linked to this device yet. Only configurations backed by a cited source are shown."
          toolHref="/eol"
          toolLabel="EOL Wiring Assistant"
        />
        <h3 className="border-t border-line px-4 pt-3 font-mono text-[11px] tracking-[0.16em] text-fg-subtle uppercase">Fault-finding workflows</h3>
        <RelatedList
          items={related.faultWorkflows}
          empty="No troubleshooting workflows are linked to this device yet."
          toolHref="/fault-finder"
          toolLabel="Guided Fault Finder"
        />
      </DeviceSection>

      <DeviceSection id="revisions" title="Model revisions">
        <ul className="divide-y divide-line">
          {device.modelRevisions.map((r) => (
            <li key={r.revision} className="flex flex-wrap gap-x-3 gap-y-0.5 px-4 py-3 text-sm">
              <span className="font-mono text-fg">{r.revision}</span>
              {r.appliesTo && <span className="text-fg-muted">{r.appliesTo}</span>}
              {r.notes && <span className="text-fg-muted">{r.notes}</span>}
            </li>
          ))}
        </ul>
      </DeviceSection>
    </article>
  );
}
