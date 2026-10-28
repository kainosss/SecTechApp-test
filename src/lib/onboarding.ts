/**
 * First-run welcome: remembered on this device only (not per workspace), so a
 * returning technician isn't shown it again. Help can bring it back.
 */
export const ONBOARDING_KEY = "fieldwise:onboarding:v1";
export const ONBOARDING_EVENT = "fieldwise:onboarding";

export function isWelcomeDone(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_KEY) === "done";
  } catch {
    // Storage unavailable: don't nag on every page load.
    return true;
  }
}

function set(done: boolean) {
  try {
    if (done) window.localStorage.setItem(ONBOARDING_KEY, "done");
    else window.localStorage.removeItem(ONBOARDING_KEY);
  } catch {
    // Not remembered; the welcome may show again next visit.
  }
  window.dispatchEvent(new Event(ONBOARDING_EVENT));
}

export const completeWelcome = () => set(true);
export const showWelcomeAgain = () => set(false);

export function subscribeOnboarding(cb: () => void) {
  window.addEventListener(ONBOARDING_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(ONBOARDING_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
