/**
 * Decides which drawn wires carry measurement current, from the engine's
 * conducting paths and the cable condition. Used by the diagram only.
 */
import { conductingPaths, type ContactPositions } from "./engine";
import type { LiveRule } from "./layout";
import type { CircuitNode, CircuitState } from "./model";

export interface LiveContext {
  paths: Set<string>;
  line: CircuitState["line"];
  /** The field network between the terminals conducts (finite resistance). */
  networkLive: boolean;
}

export function liveContext(network: CircuitNode, positions: ContactPositions, line: CircuitState["line"]): LiveContext {
  if (line !== "intact") return { paths: new Set(), line, networkLive: false };
  try {
    const paths = conductingPaths(network, positions);
    return { paths, line, networkLive: paths.has("0") };
  } catch {
    // Incomplete data: nothing is shown as conducting; validation reports the problem.
    return { paths: new Set(), line, networkLive: false };
  }
}

export function isLive(rule: LiveRule, ctx: LiveContext): boolean {
  switch (rule.kind) {
    case "node":
      return ctx.paths.has(rule.path);
    case "rail":
      for (let j = rule.index + 1; j < rule.branches; j++) if (ctx.paths.has(`${rule.parent}.${j}`)) return true;
      return false;
    case "loop":
      return rule.side === "near" ? ctx.line === "short" || ctx.networkLive : ctx.networkLive;
    case "short-link":
      return ctx.line === "short";
  }
}
