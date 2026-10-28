import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { BackupPanel, BackupReminder } from "@/components/backup/BackupPanel";
import { DemoWorkspaceBanner } from "@/components/demo/DemoWorkspaceBanner";
import { ShowWelcomeButton } from "@/components/help/ShowWelcomeButton";
import { WelcomeCard } from "@/components/onboarding/WelcomeCard";
import HelpPage from "@/app/help/page";
import { enterDemo } from "@/lib/demo/workspace";
import { createRegister } from "@/lib/techdocs/register";
import { loadRegisters, REGISTERS_KEY, saveRegister } from "@/lib/techdocs/store";
import { ONBOARDING_KEY } from "@/lib/onboarding";
import { isDemoWorkspace } from "@/lib/workspace";

describe("welcome", () => {
  it("shows the six tools to a first-time visitor and stays dismissed after Skip", async () => {
    const { unmount } = render(<WelcomeCard />);
    const card = screen.getByTestId("welcome");
    for (const t of ["Device Library", "EOL Wiring Assistant", "Circuit Lab", "Fault Finder", "Technical Docs", "Service Reports"]) {
      expect(within(card).getByText(t)).toBeInTheDocument();
    }
    await userEvent.click(within(card).getByRole("button", { name: "Skip" }));
    expect(screen.queryByTestId("welcome")).toBeNull();
    expect(window.localStorage.getItem(ONBOARDING_KEY)).toBe("done");
    unmount();
    render(<WelcomeCard />);
    expect(screen.queryByTestId("welcome")).toBeNull();
  });

  it("Get started dismisses it", async () => {
    render(<WelcomeCard />);
    await userEvent.click(screen.getByRole("button", { name: "Get started" }));
    expect(screen.queryByTestId("welcome")).toBeNull();
  });

  it("can be shown again from Help", async () => {
    window.localStorage.setItem(ONBOARDING_KEY, "done");
    render(
      <>
        <WelcomeCard />
        <ShowWelcomeButton />
      </>,
    );
    expect(screen.queryByTestId("welcome")).toBeNull();
    const link = screen.getByRole("link", { name: "Show the welcome again" });
    expect(link).toHaveAttribute("href", "/");
    await userEvent.click(link);
    expect(screen.getByTestId("welcome")).toBeInTheDocument();
  });

  it("opens the demo workspace from the welcome", async () => {
    render(<WelcomeCard />);
    const link = screen.getByRole("link", { name: "Explore the demo site" });
    expect(link).toHaveAttribute("href", "/tech-docs");
    await userEvent.click(link);
    expect(isDemoWorkspace()).toBe(true);
    expect(window.localStorage.getItem(ONBOARDING_KEY)).toBe("done");
  });
});

describe("help page", () => {
  it("explains statuses, privacy and links every tool", () => {
    render(<HelpPage />);
    for (const s of ["Verified against manufacturer documentation", "Generic training example", "Requires verification"]) expect(screen.getByText(s)).toBeInTheDocument();
    const privacy = screen.getByTestId("privacy");
    expect(privacy).toHaveTextContent(/this browser on this device only/);
    expect(privacy).toHaveTextContent(/no analytics/i);
    expect(privacy).toHaveTextContent(/not a production cloud service/);
    for (const href of ["/devices", "/eol", "/circuit-lab", "/fault-finder", "/tech-docs", "/reports", "/feedback"]) {
      expect(document.querySelector(`a[href="${href}"]`)).not.toBeNull();
    }
  });
});

describe("demo workspace UI", () => {
  it("banner appears only in the demo; reset needs confirmation; exit returns to real records", async () => {
    saveRegister({ ...createRegister("Real"), name: "Real site" });
    const realRaw = window.localStorage.getItem(REGISTERS_KEY);
    render(<DemoWorkspaceBanner />);
    expect(screen.queryByTestId("demo-banner")).toBeNull();
    act(() => void enterDemo());
    const banner = screen.getByTestId("demo-banner");
    expect(banner).toHaveTextContent(/fictional/);
    saveRegister({ ...createRegister("Demo"), name: "Scratch" });
    await userEvent.click(within(banner).getByRole("button", { name: "Reset demo…" }));
    expect(loadRegisters().registers.map((r) => r.name)).toContain("Scratch");
    await userEvent.click(within(banner).getByRole("button", { name: "Reset demo" }));
    expect(loadRegisters().registers.map((r) => r.name)).not.toContain("Scratch");
    await userEvent.click(within(banner).getByRole("link", { name: "Exit demo" }));
    expect(screen.queryByTestId("demo-banner")).toBeNull();
    expect(loadRegisters().registers.map((r) => r.name)).toEqual(["Real site"]);
    expect(window.localStorage.getItem(REGISTERS_KEY)).toBe(realRaw);
  });

  it("turns backup and restore off in the demo", () => {
    act(() => void enterDemo());
    render(
      <>
        <BackupReminder />
        <BackupPanel />
      </>,
    );
    expect(screen.getByTestId("backup-demo-note")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /download.*backup/i })).toBeNull();
    expect(screen.queryByTestId("backup-reminder")).toBeNull();
  });
});
