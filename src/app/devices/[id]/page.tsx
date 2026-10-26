import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDevice, getDevices, getManufacturer, getSource } from "@/lib/content/repository";
import { CATEGORY_LABELS, type SourceRef } from "@/lib/content/schema";
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
  return { title: device ? `${device.model} ${device.name}` : "Device not found" };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-ink-900">
      <h2 className="flex h-12 items-center border-b border-line px-4 text-sm font-semibold text-fg">{title}</h2>
      {children}
    </section>
  );
}

function Citation({ refs }: { refs: SourceRef[] }) {
  if (refs.length === 0) return <span className="text-unverified">No source cited</span>;
  return (
    <>
      {refs
        .map((r) => [getSource(r.sourceId)?.title ?? r.sourceId, r.locator].filter(Boolean).join(", "))
        .join("; ")}
    </>
  );
}

export default async function DevicePage({ params }: Props) {
  const device = getDevice((await params).id);
  if (!device) notFound();
  const manufacturer = getManufacturer(device.manufacturerId);
  const { status, notes } = device.verification;
  const v = device.power?.supplyVoltage;

  return (
    <article className="flex flex-col gap-4">
      <RecordView deviceId={device.id} />
      <nav aria-label="Breadcrumb" className="text-sm text-fg-subtle">
        <Link href="/devices" className="hover:text-fg">
          Device Library
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-fg-muted">{manufacturer?.name}</span>
      </nav>

      <header>
        <p className="text-sm text-fg-muted">
          {manufacturer?.name} · {CATEGORY_LABELS[device.category]}
        </p>
        <h1 className="mt-1 font-mono text-3xl font-medium tracking-tight text-fg">{device.model}</h1>
        <p className="mt-1 text-lg text-fg">{device.name}</p>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-fg-muted">{device.summary}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <FavouriteButton deviceId={device.id} />
        </div>
      </header>

      <div
        role="note"
        className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${
          status === "verified" ? "border-verified/30 bg-verified/5" : status === "example" ? "border-example/30 bg-example/[0.07]" : "border-unverified/30 bg-unverified/5"
        }`}
      >
        <div className="flex items-center gap-2">
          <VerificationBadge status={status} />
          {device.verification.verifiedAt && (
            <span className="text-xs text-fg-muted">
              Checked {device.verification.verifiedAt} by {device.verification.verifiedBy}
            </span>
          )}
        </div>
        {notes && <p className="mt-2 text-fg">{notes}</p>}
      </div>

      <Section title="Model revisions">
        <ul className="divide-y divide-line">
          {device.modelRevisions.map((r) => (
            <li key={r.revision} className="flex flex-wrap gap-x-3 px-4 py-3 text-sm">
              <span className="font-mono text-fg">{r.revision}</span>
              {r.appliesTo && <span className="text-fg-muted">{r.appliesTo}</span>}
              {r.notes && <span className="text-fg-muted">{r.notes}</span>}
            </li>
          ))}
        </ul>
      </Section>

      {device.terminals.length > 0 && (
        <Section title="Terminals">
          <ul className="divide-y divide-line">
            {device.terminals.map((t) => (
              <li key={t.label} className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_1fr]">
                <span className="font-mono text-[15px] text-signal-300">{t.label}</span>
                <span>
                  <span className="block text-[15px] text-fg">{t.function}</span>
                  {t.notes && <span className="mt-0.5 block text-sm text-fg-muted">{t.notes}</span>}
                  <span className="mt-1 block text-xs text-fg-subtle">
                    Source: <Citation refs={t.sourceRefs} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {device.power && (
        <Section title="Power">
          <dl className="grid grid-cols-2 gap-px bg-line">
            {v && (
              <div className="bg-ink-900 px-4 py-3">
                <dt className="text-xs text-fg-muted">Supply voltage</dt>
                <dd className="mt-0.5 font-mono text-fg">
                  {v.min}–{v.max} V {v.type}
                  {v.nominal ? ` (nom. ${v.nominal} V)` : ""}
                </dd>
              </div>
            )}
            {device.power.currentDrawMa?.standby !== undefined && (
              <div className="bg-ink-900 px-4 py-3">
                <dt className="text-xs text-fg-muted">Standby / alarm current</dt>
                <dd className="mt-0.5 font-mono text-fg">
                  {device.power.currentDrawMa.standby} / {device.power.currentDrawMa.alarm ?? "—"} mA
                </dd>
              </div>
            )}
          </dl>
          <p className="border-t border-line px-4 py-3 text-xs text-fg-subtle">
            {device.power.notes && <span className="mr-1 text-fg-muted">{device.power.notes}</span>}
            Source: <Citation refs={device.power.sourceRefs} />
          </p>
        </Section>
      )}

      <Section title="Documentation">
        <ul className="divide-y divide-line">
          {device.documentation.map((ref) => {
            const source = getSource(ref.sourceId);
            if (!source) return null;
            const body = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] text-fg">{source.title}</span>
                  <span className="block text-xs text-fg-muted">
                    {source.publisher}
                    {source.documentRevision && ` · ${source.documentRevision}`}
                    {source.isDemo && " · Not a real document"}
                  </span>
                </span>
                {source.url && <Icon name="external" className="size-4 shrink-0 text-fg-subtle" />}
              </>
            );
            return (
              <li key={ref.sourceId}>
                {source.url ? (
                  <a href={source.url} target="_blank" rel="noreferrer" className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-ink-850">
                    {body}
                  </a>
                ) : (
                  <div className="flex min-h-14 items-center gap-3 px-4 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Related">
        <p className="px-4 py-4 text-sm leading-relaxed text-fg-muted">
          Verified EOL configurations and fault guides for this device will be linked here once the EOL Wiring Assistant
          and Guided Fault Finder are built. None are shown until they are backed by a cited source.
        </p>
      </Section>
    </article>
  );
}
