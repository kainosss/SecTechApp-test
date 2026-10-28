import { DemoWorkspaceBanner } from "@/components/demo/DemoWorkspaceBanner";
import { BottomNav } from "./BottomNav";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-signal-500 focus:px-3 focus:py-2 focus:text-ink-950">
        Skip to content
      </a>
      <Sidebar />
      <TopBar />
      <div className="lg:pl-64">
        <DemoWorkspaceBanner />
        <main id="main" className="mx-auto w-full max-w-5xl px-4 pt-5 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-16">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
