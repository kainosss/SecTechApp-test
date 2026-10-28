import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "./Logo";

/** Mobile-only header. Desktop uses the sidebar. */
export function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-ink-950/90 px-4 backdrop-blur lg:hidden">
      <Logo />
      <div className="flex items-center">
      <Link
        href="/help"
        aria-label="Help"
        className="grid size-11 place-items-center rounded-lg text-fg-muted active:bg-ink-800 active:text-fg"
      >
        <Icon name="help" className="size-[22px]" />
      </Link>
      <Link
        href="/search"
        aria-label="Search"
        className="grid size-11 place-items-center rounded-lg text-fg-muted active:bg-ink-800 active:text-fg"
      >
        <Icon name="search" className="size-[22px]" />
      </Link>
      </div>
    </header>
  );
}
