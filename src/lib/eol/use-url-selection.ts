"use client";

import { useCallback, useSyncExternalStore } from "react";
import { parseSelection, selectionToSearch, type AssistantSelection } from "./assistant";

const EVENT = "fieldwise:url";

function subscribe(cb: () => void) {
  window.addEventListener("popstate", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("popstate", cb);
    window.removeEventListener(EVENT, cb);
  };
}

/**
 * Assistant selection stored in the URL. Step changes push a history entry
 * (so the phone's Back button steps back); state changes replace it.
 */
export function useUrlSelection() {
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => "");
  const selection = parseSelection(search);

  const update = useCallback((next: AssistantSelection, mode: "push" | "replace") => {
    const url = `${window.location.pathname}${selectionToSearch(next)}`;
    if (url === `${window.location.pathname}${window.location.search}`) return;
    if (mode === "push") window.history.pushState(window.history.state, "", url);
    else window.history.replaceState(window.history.state, "", url);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { selection, update };
}
