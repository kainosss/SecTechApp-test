import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedbackForm } from "@/components/feedback/FeedbackForm";
import { EMPTY_FEEDBACK, feedbackFileName, feedbackRecipient, feedbackText, mailtoUrl, sensitiveHints } from "@/lib/feedback";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("feedback text", () => {
  it("includes only what the tester typed, plus the version", () => {
    const text = feedbackText({ ...EMPTY_FEEDBACK, type: "incorrect-technical", page: "EOL", description: "Value looks wrong", severity: "High" }, "0.9.0");
    expect(text).toBe(["Fieldwise feedback — Incorrect technical information", "App version: 0.9.0", "Severity: High", "", "Feature or page:", "EOL", "", "Description:", "Value looks wrong"].join("\n"));
  });

  it("never invents a recipient", () => {
    expect(feedbackRecipient(undefined)).toBeNull();
    expect(feedbackRecipient("")).toBeNull();
    expect(feedbackRecipient("not an address")).toBeNull();
    expect(feedbackRecipient(" pilot@example.org ")).toBe("pilot@example.org");
    expect(mailtoUrl("pilot@example.org", { ...EMPTY_FEEDBACK, description: "Hi & bye" }, "0.9.0")).toMatch(/^mailto:pilot@example\.org\?subject=Fieldwise%20feedback%3A%20Bug&body=.*Hi%20%26%20bye/);
  });

  it("warns about likely sensitive details without changing them", () => {
    expect(sensitiveHints("Camera at 192.168.1.20, call 0412 345 678, user code 1234, a@b.com")).toEqual(["an IP address", "an email address", "a phone number", "a password or code"]);
    expect(sensitiveHints("Zone 3 reads 4.4 kΩ in alarm")).toEqual([]);
  });

  it("names downloads by type and date", () => {
    expect(feedbackFileName({ ...EMPTY_FEEDBACK, type: "feature" }, new Date(2026, 9, 28))).toBe("Fieldwise-Feedback-feature-2026-10-28.txt");
  });
});

describe("feedback form", () => {
  it("says nothing was sent, copies on request and offers no email without a configured recipient", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<FeedbackForm />);
    expect(screen.getByTestId("feedback-status")).toHaveTextContent("Nothing has been sent.");
    expect(screen.getByRole("button", { name: "Copy feedback" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: /email/i })).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Confusing instructions" }));
    await user.type(screen.getByRole("textbox", { name: /What happened\?/ }), "Unclear step");
    await user.click(screen.getByRole("button", { name: "Copy feedback" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Confusing instructions"));
    expect(writeText.mock.calls[0]![0]).toContain("Unclear step");
    expect(screen.getByTestId("feedback-status")).toHaveTextContent(/Nothing has been sent/);
    expect(window.localStorage.length).toBe(0);
  });

  it("shows the sensitive-detail warning", async () => {
    render(<FeedbackForm />);
    await userEvent.type(screen.getByRole("textbox", { name: /What happened\?/ }), "NVR 10.0.0.5");
    expect(screen.getByTestId("sensitive-hint")).toHaveTextContent("an IP address");
  });

  it("offers an email draft only when a recipient is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_FEEDBACK_EMAIL", "pilot@example.org");
    render(<FeedbackForm />);
    expect(screen.queryByRole("link", { name: "Open as email draft" })).toBeNull();
    await userEvent.type(screen.getByRole("textbox", { name: /What happened\?/ }), "x");
    expect(screen.getByRole("link", { name: "Open as email draft" })).toHaveAttribute("href", expect.stringMatching(/^mailto:pilot@example\.org/));
  });
});
