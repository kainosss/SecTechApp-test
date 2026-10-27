import { describe, expect, it } from "vitest";
import { answer, startSession, type Session } from "@/lib/fault-finder/engine";
import { clearSession, loadSession, parseSaved, saveSession, savedProgress, SESSIONS_KEY } from "@/lib/fault-finder/sessions";
import { getDiagnosticWorkflow } from "@/lib/fault-finder/workflows";

const wf = getDiagnosticWorkflow("zone-permanently-open")!;
function build(inputs: ({ answer: string } | { value: string })[]): Session {
  let s = startSession(wf);
  for (const i of inputs) {
    const r = answer(wf, s, i);
    if (!r.ok) throw new Error(r.error);
    s = r.session;
  }
  return s;
}

describe("saved diagnostic sessions", () => {
  it("round-trips a session, including an OL reading", () => {
    const s = build([{ answer: "2k2-2k2" }, { answer: "new" }, { value: "OL" }]);
    saveSession(s);
    const loaded = loadSession(wf);
    expect(loaded.status).toBe("restored");
    expect(loaded.session.steps).toEqual(s.steps);
    expect(loaded.session.steps[2]!.value).toBe(Infinity);
    expect(savedProgress(window.localStorage.getItem(SESSIONS_KEY), [wf])).toEqual({ [wf.id]: 3 });
    expect(savedProgress(window.localStorage.getItem(SESSIONS_KEY), [{ id: wf.id, version: wf.version + 1 }])).toEqual({});
  });

  it("discards sessions saved against an older version of the guide", () => {
    window.localStorage.setItem(SESSIONS_KEY, JSON.stringify({ version: 1, sessions: { [wf.id]: { version: 99, steps: [{ node: "eol", answer: "2k2-2k2" }], updatedAt: "x" } } }));
    expect(loadSession(wf)).toMatchObject({ status: "outdated", session: { steps: [] } });
  });

  it("trims steps that no longer fit the guide", () => {
    window.localStorage.setItem(
      SESSIONS_KEY,
      JSON.stringify({ version: 1, sessions: { [wf.id]: { version: wf.version, steps: [{ node: "eol", answer: "2k2-2k2" }, { node: "history", answer: "removed" }], updatedAt: "x" } } }),
    );
    const loaded = loadSession(wf);
    expect(loaded.status).toBe("trimmed");
    expect(loaded.session.steps).toHaveLength(1);
  });

  it("ignores invalid saved data", () => {
    for (const raw of ["{bad", JSON.stringify({ version: 2 }), JSON.stringify({ version: 1, sessions: { x: { steps: "nope" } } }), JSON.stringify({ version: 1, sessions: { [wf.id]: { version: 1, steps: [{ node: "eol", answer: "2k2-2k2", value: -4 }], updatedAt: "x" } } })]) {
      expect(parseSaved(raw).sessions).toEqual({});
      expect(loadSession(wf, raw).status).toBe("none");
    }
  });

  it("clears one session without touching others", () => {
    saveSession(build([{ answer: "2k2-2k2" }]));
    const door = getDiagnosticWorkflow("door-not-unlocking")!;
    const r = answer(door, startSession(door), { answer: "denied" });
    if (r.ok) saveSession(r.session);
    clearSession(wf.id);
    expect(Object.keys(parseSaved(window.localStorage.getItem(SESSIONS_KEY)).sessions)).toEqual(["door-not-unlocking"]);
  });
});
