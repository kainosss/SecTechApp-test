/**
 * Pilot feedback, written by the tester and turned into plain text they can
 * copy, download or (only if a recipient is configured) open as an email
 * draft. Nothing is collected automatically and nothing is sent by Fieldwise.
 */
export const FEEDBACK_TYPES = [
  { id: "bug", label: "Bug" },
  { id: "feature", label: "Feature suggestion" },
  { id: "confusing", label: "Confusing instructions" },
  { id: "incorrect-technical", label: "Incorrect technical information" },
  { id: "general", label: "General feedback" },
] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number]["id"];

export const SEVERITIES = ["", "Low", "Medium", "High", "Blocks my work"] as const;

export interface Feedback {
  type: FeedbackType;
  page: string;
  description: string;
  steps: string;
  expected: string;
  actual: string;
  severity: (typeof SEVERITIES)[number];
}

export const EMPTY_FEEDBACK: Feedback = { type: "bug", page: "", description: "", steps: "", expected: "", actual: "", severity: "" };

/** A configured recipient, or null. Never a made-up address. */
export function feedbackRecipient(value = process.env.NEXT_PUBLIC_FEEDBACK_EMAIL): string | null {
  const v = (value ?? "").trim();
  return /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/.test(v) ? v : null;
}

export function isEmpty(f: Feedback): boolean {
  return ![f.page, f.description, f.steps, f.expected, f.actual].some((v) => v.trim());
}

export function feedbackText(f: Feedback, version: string): string {
  const label = FEEDBACK_TYPES.find((t) => t.id === f.type)?.label ?? "General feedback";
  const lines = [`Fieldwise feedback — ${label}`, `App version: ${version}`];
  const add = (heading: string, value: string) => {
    if (value.trim()) lines.push("", `${heading}:`, value.trim());
  };
  if (f.severity) lines.push(`Severity: ${f.severity}`);
  add("Feature or page", f.page);
  add("Description", f.description);
  add("Steps to reproduce", f.steps);
  add("Expected result", f.expected);
  add("Actual result", f.actual);
  return lines.join("\n");
}

/**
 * Things the tester may not want to share, so they can remove them before
 * passing feedback on. Only a warning — the text is never changed.
 */
export function sensitiveHints(text: string): string[] {
  const hints: string[] = [];
  if (/\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(text)) hints.push("an IP address");
  if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(text)) hints.push("an email address");
  if (/(?:\+?61|\b0)[2-478](?:[ -]?\d){8}\b/.test(text)) hints.push("a phone number");
  if (/\b(password|passcode|pin|user code|alarm code|login)\b/i.test(text)) hints.push("a password or code");
  return hints;
}

export function feedbackFileName(f: Feedback, now = new Date()): string {
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `Fieldwise-Feedback-${f.type}-${d}.txt`;
}

export function mailtoUrl(recipient: string, f: Feedback, version: string): string {
  const label = FEEDBACK_TYPES.find((t) => t.id === f.type)?.label ?? "Feedback";
  return `mailto:${encodeURIComponent(recipient).replace("%40", "@")}?subject=${encodeURIComponent(`Fieldwise feedback: ${label}`)}&body=${encodeURIComponent(feedbackText(f, version))}`;
}
