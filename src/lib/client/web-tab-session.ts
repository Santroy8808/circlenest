const WEB_TAB_SESSION_KEY = "theta-space.web-tab-session";

function randomToken() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createWebTabSessionMarker() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(WEB_TAB_SESSION_KEY, randomToken());
}

export function clearWebTabSessionMarker() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(WEB_TAB_SESSION_KEY);
}

export function hasWebTabSessionMarker() {
  if (typeof window === "undefined") return false;
  return Boolean(window.sessionStorage.getItem(WEB_TAB_SESSION_KEY));
}
