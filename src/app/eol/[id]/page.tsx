import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getWiringConfiguration, listWiringConfigurations } from "@/lib/content/repository";
import { selectionToSearch } from "@/lib/eol/assistant";
import { ConfigurationPermalink } from "@/components/eol/ConfigurationPermalink";
import { Icon } from "@/components/ui/Icon";

type Props = { params: Promise<{ id: string }> };

export async function generateStaticParams() {
  return (await listWiringConfigurations()).map((r) => ({ id: r.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const record = await getWiringConfiguration((await params).id);
  return { title: record ? `${record.configurationLabel} · ${record.title}` : "Wiring configuration not found" };
}

export default async function WiringPage({ params }: Props) {
  const detail = await getWiringConfiguration((await params).id);
  if (!detail) notFound();
  const assistantHref = detail.generic
    ? `/eol?t=${detail.id}`
    : `/eol${selectionToSearch({ panel: detail.panel?.id ?? "", arrangement: detail.arrangement.key, config: detail.id })}`;

  return (
    <article className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/eol" className="-ml-2 inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-fg-muted hover:bg-ink-850 hover:text-fg">
          <Icon name="chevron-right" className="size-4 rotate-180" />
          EOL Wiring Assistant
        </Link>
        <Link href={assistantHref} className="inline-flex h-10 items-center rounded-lg px-2 text-sm font-medium text-signal-400 hover:text-signal-300">
          Open in assistant
        </Link>
      </div>
      <p className="font-mono text-xs tracking-[0.18em] text-signal-400 uppercase">
        Wiring configuration{detail.panel ? ` · ${detail.panel.manufacturerName} ${detail.panel.model}` : " · Generic"}
      </p>
      <ConfigurationPermalink detail={detail} />
    </article>
  );
}
