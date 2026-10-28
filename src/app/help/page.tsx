import type { Metadata } from "next";
import Link from "next/link";
import { EnterDemoButton } from "@/components/demo/DemoWorkspaceBanner";
import { ShowWelcomeButton } from "@/components/help/ShowWelcomeButton";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { APP_VERSION } from "@/lib/config";
import { TOOL_GUIDE } from "@/lib/guide";

export const metadata: Metadata = { title: "Help" };

const STATUSES = [
  {
    label: "Verified against manufacturer documentation",
    tone: "border-verified/40 text-verified",
    text: "Checked by a named person against a cited manufacturer document. Still confirm the version matches the equipment on site.",
  },
  {
    label: "Generic training example",
    tone: "border-signal-400/40 text-signal-300",
    text: "Electrically correct example values or general guidance (for example 2.2 kΩ / 4.4 kΩ or 10 kΩ / 20 kΩ dual EOL). Not a manufacturer instruction and not a default for any panel.",
  },
  {
    label: "Requires verification",
    tone: "border-unverified/40 text-unverified",
    text: "Not yet confirmed against manufacturer documentation. Check the manual and the panel's programmed configuration before relying on it.",
  },
  {
    label: "Demonstration only",
    tone: "border-example/40 text-example",
    text: "Fictional records for exploring the app. Never use them on site.",
  },
];

const section = "flex flex-col gap-3";
const h2 = "text-[15px] font-semibold text-fg";
const card = "rounded-2xl border border-line bg-ink-900 p-4";

export default function HelpPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="Help" title="Using Fieldwise" description="What each tool is for, what the content labels mean, and where your data is kept." />

      <section aria-labelledby="tools-help" className={section}>
        <h2 id="tools-help" className={h2}>
          The tools
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {TOOL_GUIDE.map((t) => (
            <li key={t.href} className={card}>
              <Link href={t.href} className="flex min-h-11 items-center gap-2 text-[15px] font-semibold text-signal-400 hover:text-signal-300">
                <Icon name={t.icon} className="size-5" />
                {t.title}
              </Link>
              <p className="mt-1 text-sm leading-relaxed text-fg">{t.what}</p>
              <p className="mt-1 text-sm leading-relaxed text-fg-muted">{t.when}</p>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <ShowWelcomeButton />
        </div>
      </section>

      <section aria-labelledby="status-help" className={section}>
        <h2 id="status-help" className={h2}>
          What the content labels mean
        </h2>
        <ul className="flex flex-col gap-2">
          {STATUSES.map((s) => (
            <li key={s.label} className={`rounded-xl border bg-ink-900 px-4 py-3 ${s.tone}`}>
              <p className="text-sm font-semibold">{s.label}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-fg-muted">{s.text}</p>
            </li>
          ))}
        </ul>
        <p className="text-sm leading-relaxed text-fg-muted">
          Content is only marked verified when a real source supports it and a person has checked it — never automatically, and an AI review doesn&apos;t count.
          Fault Finder guides show &quot;Generic training example&quot; unless a technician review is recorded. Terminal layouts shown are generic and illustrative.
        </p>
      </section>

      <section aria-labelledby="safety-help" className={section}>
        <h2 id="safety-help" className={h2}>
          Safety
        </h2>
        <ul className={`${card} list-disc space-y-1 pl-8 text-sm leading-relaxed text-fg`}>
          <li>Measure resistance only with the circuit de-energised and the zone disconnected from the panel.</li>
          <li>Never probe supply terminals on the resistance range.</li>
          <li>Follow the manufacturer&apos;s instructions, site procedures and your licence conditions. Fieldwise doesn&apos;t replace them.</li>
        </ul>
      </section>

      <section aria-labelledby="data-help" className={section}>
        <h2 id="data-help" className={h2}>
          Your data and privacy
        </h2>
        <ul className={`${card} list-disc space-y-1 pl-8 text-sm leading-relaxed text-fg`} data-testid="privacy">
          <li>Registers, service reports and branding are saved in this browser on this device only. There are no accounts and no cloud sync.</li>
          <li>Clearing your browser data, using private browsing, or changing device can lose your records. Download a complete backup regularly (Technical Docs or Service Reports).</li>
          <li>Backups, Excel files and PDFs are files you control. Fieldwise doesn&apos;t upload them.</li>
          <li>Fieldwise has no analytics or tracking. Feedback is never sent automatically — you choose whether to copy, download or email it.</li>
          <li>Don&apos;t store passwords, alarm codes or other credentials in Fieldwise.</li>
          <li>This is a pilot build, not a production cloud service. It hasn&apos;t had an independent security audit.</li>
        </ul>
      </section>

      <section aria-labelledby="demo-help" className={section}>
        <h2 id="demo-help" className={h2}>
          Demo site
        </h2>
        <div className={card}>
          <p className="text-sm leading-relaxed text-fg">
            Riverside Business Centre is a fictional site with CCTV, an intruder alarm and access control, two sample service reports and equipment history. It uses
            documentation-only network addresses and contains no real customers, credentials or codes.
          </p>
          <p className="mt-1 text-sm leading-relaxed text-fg-muted">
            The demo opens in a separate workspace: your own records are hidden while it&apos;s open and are never changed. Reset or leave it from the banner at the top of
            the page.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <EnterDemoButton />
          </div>
        </div>
      </section>

      <section aria-labelledby="feedback-help" className={section}>
        <h2 id="feedback-help" className={h2}>
          Feedback
        </h2>
        <p className="text-sm leading-relaxed text-fg">
          Found a problem, an unclear instruction or incorrect technical information?{" "}
          <Link href="/feedback" className="font-medium text-signal-400 underline-offset-2 hover:underline">
            Write feedback
          </Link>
          .
        </p>
        <p className="font-mono text-xs text-fg-subtle">Fieldwise {APP_VERSION} · pilot build</p>
      </section>
    </div>
  );
}
