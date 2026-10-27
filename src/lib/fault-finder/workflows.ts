/**
 * Guided diagnostic workflows, loaded from /content/diagnostics and validated
 * with the schema at import time (invalid content fails the build and tests).
 */
import zoneOpen from "@content/diagnostics/zone-permanently-open.json";
import zoneShorted from "@content/diagnostics/zone-permanently-shorted.json";
import pir from "@content/diagnostics/pir-not-activating.json";
import tamper from "@content/diagnostics/tamper-will-not-clear.json";
import door from "@content/diagnostics/door-not-unlocking.json";
import { workflowSchema, type Workflow } from "./schema";

export const WORKFLOWS: Workflow[] = [zoneOpen, zoneShorted, pir, tamper, door].map((w) => workflowSchema.parse(w));

export function getDiagnosticWorkflow(id: string): Workflow | undefined {
  return WORKFLOWS.find((w) => w.id === id);
}
