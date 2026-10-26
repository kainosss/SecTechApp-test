import type { VerificationStatus } from "@/lib/content/schema";

export const RECORD_STATUS_EXPLANATION: Record<VerificationStatus, string> = {
  verified: "Checked by a named reviewer against the cited manufacturer documentation for the listed revisions.",
  "needs-verification":
    "Not yet verified against manufacturer documentation. Don't follow it as installation instructions — confirm with the manufacturer's manual.",
  demonstration: "Fictional demonstration record used to develop Fieldwise. Never use it on site.",
};
