/**
 * Recently viewed and favourite devices, stored on the device in
 * localStorage. Pure list operations are separated from storage access so
 * they can be unit tested and later synced to a Supabase user profile.
 */

export const RECENT_KEY = "fieldwise:recent-devices";
export const FAVOURITES_KEY = "fieldwise:favourite-devices";
export const MAX_RECENT = 8;

export function pushRecent(list: string[], id: string, max = MAX_RECENT): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, max);
}

export function toggleFavourite(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/** Parses stored JSON defensively; anything unexpected becomes an empty list. */
export function parseIdList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
