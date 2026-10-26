/**
 * Remembers where the technician was in the Device Library (the exact URL,
 * including filters and how many results were shown, plus scroll position)
 * for the current browser tab, so returning from a device page lands them
 * back in the same place.
 */
const KEY = "fieldwise:library-state";

export interface LibraryState {
  /** Path + query string, e.g. "/devices?q=axis&shown=80". */
  url: string;
  scrollY: number;
}

export function parseLibraryState(raw: string | null): LibraryState | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (
      typeof v === "object" && v !== null &&
      typeof (v as LibraryState).url === "string" && /^\/devices(\?|$)/.test((v as LibraryState).url) &&
      typeof (v as LibraryState).scrollY === "number" && Number.isFinite((v as LibraryState).scrollY)
    ) {
      return { url: (v as LibraryState).url, scrollY: Math.max(0, (v as LibraryState).scrollY) };
    }
  } catch {
    // fall through
  }
  return null;
}

export function readLibraryState(): LibraryState | null {
  try {
    return parseLibraryState(window.sessionStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function writeLibraryState(state: LibraryState) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable — returning to the library still keeps filters via the URL.
  }
}
