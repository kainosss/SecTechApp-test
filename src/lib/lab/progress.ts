/**
 * Circuit Lab training progress, saved on this device only (localStorage).
 * Saved data is validated on read: anything outdated or invalid is dropped
 * rather than trusted.
 */
import { z } from "zod";
import { BENCH_POINTS, type PlacedComponent } from "./bench";
import { LAB_EXERCISES } from "./exercises";
import { FAULT_LOCATIONS, FAULT_TYPES, type Diagnosis } from "./faults";

export const PROGRESS_KEY = "fieldwise:lab:progress:v1";
/** The wiring bench keeps its in-progress wiring under its own key (v0.4.0). */
export const BENCH_KEY = "fieldwise:lab:pir-deol:v1";
export const PROGRESS_EVENT = "fieldwise:lab-progress";

const pointIds = BENCH_POINTS.map((p) => p.id) as [string, ...string[]];
const componentSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["wire", "resistor"]),
  ohms: z.number().positive().finite().optional(),
  a: z.enum(pointIds),
  b: z.enum(pointIds),
});

const exerciseSchema = z.object({
  completed: z.boolean().default(false),
  components: z.array(componentSchema).max(200).optional(),
  repaired: z.boolean().default(false),
  diagnosis: z
    .object({
      type: z.enum(FAULT_TYPES.map((t) => t.id) as [string, ...string[]]).nullable(),
      location: z.enum(FAULT_LOCATIONS.map((l) => l.id) as [string, ...string[]]).nullable(),
      value: z.number().positive().nullable().optional(),
    })
    .optional(),
  /** The learner's last diagnosis was accepted (re-checked against the circuit on restore). */
  diagnosed: z.boolean().default(false),
  hintsShown: z.number().int().min(0).max(10).default(0),
});

const progressSchema = z.object({
  version: z.literal(1),
  current: z.string().optional(),
  exercises: z.record(z.string(), z.unknown()).default({}),
});

export type ExerciseProgress = Omit<z.infer<typeof exerciseSchema>, "components" | "diagnosis"> & {
  components?: PlacedComponent[];
  diagnosis?: Diagnosis;
};
export interface LabProgress {
  version: 1;
  current?: string;
  exercises: Record<string, ExerciseProgress>;
}

export const EMPTY_PROGRESS: LabProgress = { version: 1, exercises: {} };
const KNOWN = new Set(LAB_EXERCISES.map((e) => e.id));

/** Parses saved JSON; unknown exercises and invalid entries are dropped individually. */
export function parseProgress(raw: string | null): LabProgress {
  if (!raw) return EMPTY_PROGRESS;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return EMPTY_PROGRESS;
  }
  const top = progressSchema.safeParse(json);
  if (!top.success) return EMPTY_PROGRESS;
  const exercises: Record<string, ExerciseProgress> = {};
  for (const [id, value] of Object.entries(top.data.exercises)) {
    if (!KNOWN.has(id)) continue;
    const parsed = exerciseSchema.safeParse(value);
    if (parsed.success) exercises[id] = parsed.data as ExerciseProgress;
  }
  return { version: 1, current: top.data.current && KNOWN.has(top.data.current) ? top.data.current : undefined, exercises };
}

export function readProgressRaw(): string | null {
  try {
    return window.localStorage.getItem(PROGRESS_KEY);
  } catch {
    return null;
  }
}

export function readProgress(): LabProgress {
  return parseProgress(readProgressRaw());
}

function write(progress: LabProgress) {
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Progress just won't persist.
  }
  window.dispatchEvent(new Event(PROGRESS_EVENT));
}

/** Merges a patch into one exercise's saved progress and marks it current. */
export function saveExercise(id: string, patch: Partial<ExerciseProgress>) {
  const p = readProgress();
  write({ ...p, current: id, exercises: { ...p.exercises, [id]: { ...EMPTY_EXERCISE, ...p.exercises[id], ...patch } } });
}

export const EMPTY_EXERCISE: ExerciseProgress = { completed: false, repaired: false, diagnosed: false, hintsShown: 0 };

/** Clears all Circuit Lab progress on this device, including the wiring bench. */
export function resetAllProgress() {
  try {
    window.localStorage.removeItem(PROGRESS_KEY);
    window.localStorage.removeItem(BENCH_KEY);
  } catch {
    // Nothing stored or storage unavailable.
  }
  window.dispatchEvent(new Event(PROGRESS_EVENT));
}

export function subscribeProgress(cb: () => void) {
  window.addEventListener(PROGRESS_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(PROGRESS_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
