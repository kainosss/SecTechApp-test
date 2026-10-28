/**
 * Workspaces keep the demo site completely separate from a technician's real
 * records. In the demo workspace every record store (Technical Docs, service
 * reports, branding, backup bookkeeping) reads and writes its own
 * "fieldwise:demo:…" keys; real records are never read, changed or copied.
 * Switching is always an explicit action and the app shows a banner while the
 * demo workspace is active.
 */
export const WORKSPACE_KEY = "fieldwise:workspace:v1";
export const WORKSPACE_EVENT = "fieldwise:workspace";

export function isDemoWorkspace(): boolean {
  try {
    return window.localStorage.getItem(WORKSPACE_KEY) === "demo";
  } catch {
    return false;
  }
}

/** The storage key for the active workspace: "fieldwise:x:v1" → "fieldwise:demo:x:v1" in the demo. */
export function scopedKey(key: string): string {
  return isDemoWorkspace() ? demoKey(key) : key;
}

export function demoKey(key: string): string {
  return key.replace(/^fieldwise:/, "fieldwise:demo:");
}

export function setDemoWorkspace(on: boolean) {
  try {
    if (on) window.localStorage.setItem(WORKSPACE_KEY, "demo");
    else window.localStorage.removeItem(WORKSPACE_KEY);
  } catch {
    // Storage unavailable: stays in the real workspace.
  }
  window.dispatchEvent(new Event(WORKSPACE_EVENT));
}

/** Store subscriptions also listen here, so every view refreshes when the workspace changes. */
export function onWorkspaceChange(cb: () => void) {
  window.addEventListener(WORKSPACE_EVENT, cb);
  return () => window.removeEventListener(WORKSPACE_EVENT, cb);
}

export function workspaceSnapshot(): string {
  return isDemoWorkspace() ? "demo" : "real";
}

export function subscribeWorkspace(cb: () => void) {
  const off = onWorkspaceChange(cb);
  window.addEventListener("storage", cb);
  return () => {
    off();
    window.removeEventListener("storage", cb);
  };
}
