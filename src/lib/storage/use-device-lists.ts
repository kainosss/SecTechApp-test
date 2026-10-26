"use client";

import { useCallback, useSyncExternalStore } from "react";
import { FAVOURITES_KEY, RECENT_KEY, parseIdList, pushRecent, toggleFavourite } from "./device-lists";

const EVENT = "fieldwise:storage";
const EMPTY: string[] = [];
const cache = new Map<string, { raw: string | null; value: string[] }>();

function read(key: string): string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return EMPTY;
  }
  const cached = cache.get(key);
  if (cached && cached.raw === raw) return cached.value;
  const value = parseIdList(raw);
  cache.set(key, { raw, value });
  return value;
}

function write(key: string, value: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode / quota) — lists simply won't persist.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function useIdList(key: string): string[] {
  return useSyncExternalStore(
    subscribe,
    () => read(key),
    () => EMPTY,
  );
}

export function useRecentDevices() {
  const ids = useIdList(RECENT_KEY);
  const record = useCallback((id: string) => write(RECENT_KEY, pushRecent(read(RECENT_KEY), id)), []);
  const clear = useCallback(() => write(RECENT_KEY, []), []);
  return { ids, record, clear };
}

export function useFavouriteDevices() {
  const ids = useIdList(FAVOURITES_KEY);
  const toggle = useCallback((id: string) => write(FAVOURITES_KEY, toggleFavourite(read(FAVOURITES_KEY), id)), []);
  return { ids, toggle, isFavourite: (id: string) => ids.includes(id) };
}
