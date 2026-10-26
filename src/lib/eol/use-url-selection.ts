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
 * The current query string, plus a setter. "push" adds a history entry (so the
 * phone's Back button undoes it); "replace" updates the current entry.
 */
export function useUrlSearch() {
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => "");
  const setSearch = useCallback((next: string, mode: "push" | "replace") => {
    const url = `${window.location.pathname}${next}`;
    if (url === `${window.location.pathname}${window.location.search}`) return;
    if (mode === "push") window.history.pushState(window.history.state, "", url);
    else window.history.replaceState(window.history.state, "", url);
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return { search, setSearch };
}

/**
 * Panel-configuration selection stored in the URL. The "panel" key is always
 * kept (possibly empty) so the page stays in panel-configuration mode;
 * exitToExplorer() returns to the generic circuit explorer.
 */
export function useUrlSelection() {
  const { search, setSearch } = useUrlSearch();
  const selection = parseSelection(search);
  const update = useCallback(
    (next: AssistantSelection, mode: "push" | "replace") => setSearch(next.panel ? selectionToSearch(next) : "?panel=", mode),
    [setSearch],
  );
  const exitToExplorer = useCallback(() => setSearch("", "push"), [setSearch]);
  return { selection, update, exitToExplorer };
}
