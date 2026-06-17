const PATH_LABELS: Array<{ prefix: string; label: string }> = [
  { prefix: "/production-zone/business", label: "Business Center" },
  { prefix: "/production-zone/writers-corner", label: "Writers" },
  { prefix: "/production-zone/fundraisers", label: "Fund Raiser" },
  { prefix: "/production-zone/auditors", label: "Find an Auditor" },
  { prefix: "/production-zone/events", label: "Events" },
  { prefix: "/production-zone/market", label: "Market" },
  { prefix: "/production-zone/jobs", label: "Find a Job" },
  { prefix: "/auditors/im-an-auditor", label: "I'm an Auditor" },
  { prefix: "/profile/gallery", label: "My Pics" },
  { prefix: "/profile", label: "Profile" },
  { prefix: "/friends", label: "Friends" },
  { prefix: "/groups", label: "Groups" },
  { prefix: "/messages", label: "Chat" },
  { prefix: "/mail", label: "Mail" },
  { prefix: "/notifications", label: "Notifications" },
  { prefix: "/alerts", label: "Alerts" },
  { prefix: "/settings", label: "Settings" },
  { prefix: "/moderation", label: "Moderator" },
  { prefix: "/admin", label: "Admin Portal" },
  { prefix: "/home", label: "My Stream" },
];

export function getPageContextLabel(pathname: string | null | undefined) {
  if (!pathname) return "My Stream";
  const match = PATH_LABELS.find((entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`));
  return match?.label ?? "My Stream";
}
