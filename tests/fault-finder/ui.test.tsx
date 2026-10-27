import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/fault-finder", notFound: () => { throw new Error("not found"); } }));

import { Diagnosis } from "@/components/fault-finder/Diagnosis";
import { GuideList } from "@/components/fault-finder/GuideList";
import FaultFinderPage from "@/app/fault-finder/page";
import { BottomNav } from "@/components/layout/BottomNav";
import { buildSearchIndex } from "@/lib/search/build-index";
import { search } from "@/lib/search/search";
import { SESSIONS_KEY } from "@/lib/fault-finder/sessions";

const start = () => fireEvent.click(screen.getByRole("button", { name: /read the safety checks/ }));
const pick = (name: string | RegExp) => fireEvent.click(within(screen.getByRole("group", { name: "Answers" })).getByRole("button", { name }));
const enter = (value: string) => {
  fireEvent.change(screen.getByLabelText(/Your reading/), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Use this reading" }));
};
const question = () => screen.getByTestId("question").textContent;

describe("guided diagnosis screen", () => {
  it("shows safety checks first, then walks a measurement-based path to a hedged result", () => {
    render(<Diagnosis workflowId="zone-permanently-open" />);
    expect(screen.getByTestId("safety")).toHaveTextContent("Only measure resistance on an isolated circuit");
    expect(screen.getByTestId("verification")).toHaveTextContent("Generic guidance — not manufacturer verified");
    expect(screen.getByTestId("verification")).toHaveTextContent("Not yet reviewed by an experienced technician");
    start();
    expect(question()).toBe("Which EOL resistors does this zone use?");
    expect(screen.getByTestId("progress-label")).toHaveTextContent("Question 1 of up to");
    pick(/^R1 2k2 \+ R2 2k2/);
    pick(/It worked, and nothing has changed/);
    expect(screen.getByTestId("test-procedure")).toHaveTextContent("disconnect both zone conductors");
    expect(screen.getByTestId("test-kind")).toHaveTextContent("Resistance test · circuit isolated and de-energised");
    expect(screen.getByTestId("test-procedure")).toHaveTextContent("About the sealed reading for the resistors you chose (2.2 kΩ)");
    expect(screen.getByTestId("bands")).toHaveTextContent("sealed 2.2 kΩ, alarm 4.4 kΩ");
    enter("OL");
    enter("2k2");
    const result = screen.getByTestId("diagnosis-result");
    expect(result).toHaveTextContent("The open is in the cable or joints");
    expect(result).toHaveTextContent("not a confirmed diagnosis");
    expect(screen.getByTestId("confidence")).toHaveTextContent("Likely — your measurements point here");
    expect(within(screen.getByTestId("measured")).getAllByRole("listitem")).toHaveLength(2);
    expect(within(result).getByText("Likely cause")).toBeInTheDocument();
    expect(within(result).getByRole("region", { name: "Verify before acting" })).toBeInTheDocument();
    expect(within(result).getByRole("region", { name: "When to escalate" })).toBeInTheDocument();
    expect(result.querySelector("[data-cause]")).toHaveAttribute("data-cause", "cable-damage");
    expect(within(screen.getByTestId("findings")).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByTestId("progress-label")).toHaveTextContent("Diagnosis complete");
  });

  it("accepts custom resistor values with a live preview, and rejects ambiguous ones", () => {
    render(<Diagnosis workflowId="zone-permanently-open" />);
    start();
    const form = screen.getByRole("form", { name: "Other resistor values" });
    fireEvent.change(within(form).getByLabelText(/R1 — EOL resistor/), { target: { value: "10k" } });
    fireEvent.change(within(form).getByLabelText(/R2 — alarm resistor/), { target: { value: "470" } });
    expect(screen.getByTestId("eol-preview")).toHaveTextContent("can't reliably tell them apart");
    fireEvent.click(within(form).getByRole("button", { name: "Use these values" }));
    expect(screen.getByRole("alert")).toHaveTextContent("tell them apart");
    expect(question()).toBe("Which EOL resistors does this zone use?");
    fireEvent.change(within(form).getByLabelText(/R1 — EOL resistor/), { target: { value: "4k7" } });
    fireEvent.change(within(form).getByLabelText(/R2 — alarm resistor/), { target: { value: "2k2" } });
    expect(screen.getByTestId("eol-preview")).toHaveTextContent("sealed 4.7 kΩ, alarm 6.9 kΩ");
    fireEvent.click(within(form).getByRole("button", { name: "Use these values" }));
    expect(screen.getByTestId("findings")).toHaveTextContent("R1 4.7 kΩ (in series), R2 2.2 kΩ");
    pick(/New installation/);
    enter("6.9k");
    expect(question()).toBe("What is the supply voltage at the detector?");
    expect(screen.getByTestId("test-kind")).toHaveTextContent("Voltage test · live, DC volts range");
    expect(screen.getByTestId("review-flag")).toHaveTextContent("Needs verification");
  });

  it("rejects an unreadable measurement and keeps the question", () => {
    render(<Diagnosis workflowId="zone-permanently-open" />);
    start();
    pick(/^R1 10k \+ R2 10k/);
    pick(/New installation/);
    enter("lots");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a resistance like");
    expect(question()).toBe("What does the zone loop measure at the panel?");
    enter("20k"); // 10k zone → alarm value
    expect(question()).toBe("What is the supply voltage at the detector?");
  });

  it("goes back, changes an earlier answer and restarts", () => {
    render(<Diagnosis workflowId="door-not-unlocking" />);
    start();
    pick(/Shows access granted/);
    pick("No, it stays locked");
    expect(question()).toBe("What type of lock is fitted?");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(question()).toMatch(/request-to-exit/);
    fireEvent.click(screen.getByRole("button", { name: /Change answer 1/ }));
    expect(question()).toBe("What does the reader do when a valid credential is presented?");
    pick(/Shows access denied/);
    expect(screen.getByTestId("diagnosis-result")).toHaveTextContent("Access is being denied by the system");
    fireEvent.click(screen.getByRole("button", { name: "Restart diagnosis" }));
    expect(question()).toBe("What does the reader do when a valid credential is presented?");
    expect(screen.queryByTestId("findings")).toBeNull();
  });

  it("links to the related guide when the evidence points elsewhere", () => {
    render(<Diagnosis workflowId="zone-permanently-open" />);
    start();
    pick(/^R1 2k2 \+ R2 2k2/);
    pick(/New installation/);
    enter("0.2");
    expect(screen.getByRole("link", { name: /Continue with: Alarm zone permanently shorted/ })).toHaveAttribute("href", "/fault-finder/diagnose/zone-permanently-shorted");
  });

  it("saves progress, resumes it, and can clear it", () => {
    const first = render(<Diagnosis workflowId="tamper-will-not-clear" />);
    start();
    pick(/A detector or zone tamper/);
    pick("Yes");
    first.unmount();

    const again = render(<Diagnosis workflowId="tamper-will-not-clear" />);
    expect(screen.getByTestId("load-status")).toHaveTextContent("Resumed your saved diagnosis (2 answers)");
    expect(question()).toMatch(/acknowledged \/ reset/);
    fireEvent.click(screen.getByRole("button", { name: "Clear saved session" }));
    expect(screen.getByTestId("safety")).toBeInTheDocument();
    again.unmount();
    expect(JSON.parse(window.localStorage.getItem(SESSIONS_KEY)!).sessions).toEqual({});
  });

  it("handles invalid saved data safely", () => {
    window.localStorage.setItem(SESSIONS_KEY, "not json");
    render(<Diagnosis workflowId="pir-not-activating" />);
    expect(screen.getByTestId("safety")).toBeInTheDocument();
    expect(screen.queryByTestId("load-status")).toBeNull();
  });
});

describe("fault finder landing and integration", () => {
  it("lists the five guided diagnoses with resume badges", () => {
    window.localStorage.setItem(SESSIONS_KEY, JSON.stringify({ version: 1, sessions: { "pir-not-activating": { version: 2, steps: [{ node: "led", answer: "no" }], updatedAt: "x" } } }));
    const { container } = render(<GuideList />);
    expect(container.querySelectorAll("[data-guide]")).toHaveLength(5);
    expect(container.querySelector('[data-guide="door-not-unlocking"]')).toHaveAttribute("href", "/fault-finder/diagnose/door-not-unlocking");
    expect(screen.getAllByTestId("resume-badge")).toHaveLength(1);
    expect(container.querySelector('[data-guide="pir-not-activating"]')).toHaveTextContent("Resume · 1 answer");
  });

  it("the landing page shows the guides and the generic-guidance notice", async () => {
    render(await FaultFinderPage());
    expect(screen.getByRole("list", { name: "Guided diagnoses" })).toBeInTheDocument();
    expect(screen.getByText(/Generic service guidance, not manufacturer instructions/)).toBeInTheDocument();
  });

  it("is reachable from the bottom navigation and search", async () => {
    render(<BottomNav />);
    expect(screen.getByRole("link", { name: "Faults" })).toHaveAttribute("href", "/fault-finder");
    expect(screen.getAllByRole("link")).toHaveLength(5); // no extra bottom-nav item
    const index = await buildSearchIndex();
    const hits = search(index, "door not unlocking").map((r) => r.href);
    expect(hits).toContain("/fault-finder/diagnose/door-not-unlocking");
    expect(search(index, "tamper").map((r) => r.href)).toContain("/fault-finder/diagnose/tamper-will-not-clear");
  });
});
