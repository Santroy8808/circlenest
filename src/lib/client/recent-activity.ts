export type RecentActivityEntry = {
  at: string;
  type: "route" | "click" | "submit";
  route: string;
  target?: string;
};

export type FeedbackPageContext = {
  url: string;
  route: string;
  pageTitle: string;
  openedAt: string;
  viewport: { width: number; height: number };
  deviceClass: "mobile" | "desktop";
  browser: string;
  operatingSystem: string;
  appVersion: string | null;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  recentActions: RecentActivityEntry[];
};

const STORAGE_KEY = "theta-space.recent-actions";
const MAX_ENTRIES = 30;

function currentRoute() {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function cleanLabel(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 140);
}

export function readRecentActivity() {
  if (typeof window === "undefined") return [] as RecentActivityEntry[];
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is RecentActivityEntry =>
        Boolean(
          entry &&
          typeof entry === "object" &&
          typeof (entry as RecentActivityEntry).at === "string" &&
          typeof (entry as RecentActivityEntry).type === "string" &&
          typeof (entry as RecentActivityEntry).route === "string"
        )
      )
      .slice(-MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function recordRecentActivity(
  type: RecentActivityEntry["type"],
  target?: string
) {
  if (typeof window === "undefined") return;
  const entries = readRecentActivity();
  entries.push({
    at: new Date().toISOString(),
    type,
    route: currentRoute().slice(0, 800),
    ...(target ? { target: cleanLabel(target) } : {})
  });
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // Feedback remains available when browser storage is disabled.
  }
}

export function describeActivityTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const element = target.closest("button, a, [role='button'], form");
  if (!element || element.closest("[data-feedback-ui]")) return null;

  const explicit =
    element.getAttribute("aria-label") ||
    element.getAttribute("title") ||
    element.getAttribute("data-tutorial-target");
  const text = explicit || element.textContent || element.tagName.toLowerCase();
  const href = element instanceof HTMLAnchorElement
    ? element.getAttribute("href")
    : null;
  return cleanLabel(`${element.tagName.toLowerCase()}: ${text}${href ? ` (${href})` : ""}`);
}

function browserName(userAgent: string) {
  if (/Edg\//.test(userAgent)) return "Microsoft Edge";
  if (/OPR\//.test(userAgent)) return "Opera";
  if (/Firefox\//.test(userAgent)) return "Firefox";
  if (/Chrome\//.test(userAgent)) return "Google Chrome";
  if (/Safari\//.test(userAgent)) return "Safari";
  return "Unknown browser";
}

function operatingSystem(userAgent: string) {
  if (/Windows NT/i.test(userAgent)) return "Windows";
  if (/Android/i.test(userAgent)) return "Android";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iOS";
  if (/Mac OS X/i.test(userAgent)) return "macOS";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "Unknown operating system";
}

function sourceEntity(pathname: string) {
  const patterns: Array<[RegExp, string]> = [
    [/^\/posts\/([^/?#]+)/, "post"],
    [/^\/profile\/gallery\/([^/?#]+)/, "gallery-asset"],
    [/^\/groups\/([^/?#]+)/, "group"],
    [/^\/events\/([^/?#]+)/, "event"],
    [/^\/market\/([^/?#]+)/, "market-listing"],
    [/^\/writers-corner\/([^/?#]+)/, "manuscript"],
    [/^\/storefront\/([^/?#]+)/, "storefront"]
  ];
  for (const [pattern, type] of patterns) {
    const match = pathname.match(pattern);
    if (match?.[1]) return { type, id: decodeURIComponent(match[1]).slice(0, 160) };
  }
  return { type: null, id: null };
}

export function captureFeedbackPageContext(): FeedbackPageContext {
  const userAgent = navigator.userAgent;
  const entity = sourceEntity(window.location.pathname);
  return {
    url: window.location.href,
    route: currentRoute(),
    pageTitle: document.title,
    openedAt: new Date().toISOString(),
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    },
    deviceClass: window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop",
    browser: browserName(userAgent),
    operatingSystem: operatingSystem(userAgent),
    appVersion:
      document.querySelector<HTMLMetaElement>('meta[name="application-version"]')?.content ||
      process.env.NEXT_PUBLIC_APP_VERSION ||
      null,
    sourceEntityType: entity.type,
    sourceEntityId: entity.id,
    recentActions: readRecentActivity()
  };
}
