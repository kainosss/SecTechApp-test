import { Icon } from "./Icon";

export function DemoNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-xl border border-example/30 bg-example/[0.07] px-4 py-3 text-sm text-fg"
    >
      <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-example" />
      <p className="leading-relaxed">
        <span className="font-semibold text-example">Demonstration content.</span>{" "}
        {compact
          ? "Devices shown are fictional examples — not for use on site."
          : "Every manufacturer and device in this build is a fictional example used to demonstrate the product. Nothing here describes real equipment — do not use it on site."}
      </p>
    </div>
  );
}
