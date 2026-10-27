/**
 * Saved diagnostic sessions (this device only, localStorage). Saved data is
 * validated and replayed against the current workflow on load: outdated or
 * tampered sessions are discarded or trimmed, never trusted.
 */
import { z } from "zod";
import { evaluate, startSession, type Session } from "./engine";
import type { Workflow } from "./schema";

export const SESSIONS_KEY = "fieldwise:fault-finder:v1";
export const SESSIONS_EVENT = "fieldwise:fault-finder";

const stepSchema = z.object({
  node: z.string().min(1).max(100),
  answer: z.string().min(1).max(100),
  // JSON can't hold Infinity, so an OL reading is stored as null.
  value: z.number().nonnegative().nullable().optional(),
  // Entered EOL resistor values (custom configuration).
  r1: z.number().positive().optional(),
  r2: z.number().positive().optional(),
});

const savedSchema = z.object({
  version: z.literal(1),
  current: z.string().optional(),
  sessions: z
    .record(
      z.string(),
      z.object({
        version: z.number().int().positive(),
        steps: z.array(stepSchema).max(100),
        updatedAt: z.string(),
      }),
    )
    .default({}),
});
type Saved = z.infer<typeof savedSchema>;

const EMPTY: Saved = { version: 1, sessions: {} };

export function parseSaved(raw: string | null): Saved {
  if (!raw) return EMPTY;
  try {
    const parsed = savedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function readSavedRaw(): string | null {
  try {
    return window.localStorage.getItem(SESSIONS_KEY);
  } catch {
    return null;
  }
}

function write(saved: Saved) {
  try {
    window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(saved));
  } catch {
    // Progress just won't persist.
  }
  window.dispatchEvent(new Event(SESSIONS_EVENT));
}

export type LoadStatus = "none" | "restored" | "trimmed" | "outdated";

/** Loads a workflow's saved session, replaying it to keep only steps the workflow still accepts. */
export function loadSession(wf: Workflow, raw: string | null = readSavedRaw()): { session: Session; status: LoadStatus } {
  const entry = parseSaved(raw).sessions[wf.id];
  if (!entry) return { session: startSession(wf), status: "none" };
  if (entry.version !== wf.version) return { session: startSession(wf), status: "outdated" };
  const steps = entry.steps.map((s) => ({
    node: s.node,
    answer: s.answer,
    ...(s.value === undefined ? {} : { value: s.value ?? Number.POSITIVE_INFINITY }),
    ...(s.r1 === undefined ? {} : { r1: s.r1 }),
    ...(s.r2 === undefined ? {} : { r2: s.r2 }),
  }));
  const session: Session = { workflowId: wf.id, version: wf.version, steps };
  const { validSteps } = evaluate(wf, session);
  if (validSteps < steps.length) return { session: { ...session, steps: steps.slice(0, validSteps) }, status: "trimmed" };
  return { session, status: steps.length ? "restored" : "none" };
}

export function saveSession(session: Session) {
  const saved = parseSaved(readSavedRaw());
  const steps = session.steps.map((s) => ({
    node: s.node,
    answer: s.answer,
    ...(s.value === undefined ? {} : { value: Number.isFinite(s.value) ? s.value : null }),
    ...(s.r1 === undefined ? {} : { r1: s.r1, r2: s.r2 }),
  }));
  write({
    ...saved,
    current: session.workflowId,
    sessions: { ...saved.sessions, [session.workflowId]: { version: session.version, steps, updatedAt: new Date().toISOString() } },
  });
}

export function clearSession(workflowId: string) {
  const saved = parseSaved(readSavedRaw());
  const { [workflowId]: _removed, ...rest } = saved.sessions;
  write({ ...saved, current: saved.current === workflowId ? undefined : saved.current, sessions: rest });
}

/** Number of saved answers per workflow (for "Resume" badges); sessions saved against another version don't count. */
export function savedProgress(raw: string | null, workflows: Pick<Workflow, "id" | "version">[]): Record<string, number> {
  const sessions = parseSaved(raw).sessions;
  return Object.fromEntries(workflows.filter((w) => sessions[w.id]?.version === w.version).map((w) => [w.id, sessions[w.id]!.steps.length]));
}

export function subscribeSessions(cb: () => void) {
  window.addEventListener(SESSIONS_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(SESSIONS_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
