import { FAULT_SCENARIOS } from "./faults";

export interface LabExercise {
  id: string;
  href: string;
  kind: "Build" | "Fault";
  title: string;
  difficulty: "Beginner";
  summary: string;
}

export const BENCH_EXERCISE_ID = "wiring-bench";

export const LAB_EXERCISES: LabExercise[] = [
  {
    id: BENCH_EXERCISE_ID,
    href: "/circuit-lab/wiring-bench",
    kind: "Build",
    title: "Wiring bench: dual EOL PIR",
    difficulty: "Beginner",
    summary: "Wire a generic NC PIR with 2k2 / 4k4 dual EOL and check it in every state.",
  },
  ...FAULT_SCENARIOS.map((s) => ({ id: s.id, href: `/circuit-lab/faults/${s.id}`, kind: "Fault" as const, title: s.title, difficulty: s.difficulty, summary: s.summary })),
];
