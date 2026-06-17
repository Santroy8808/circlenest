export type ControlPanelLink = {
  label: string;
  href: string;
  mark: string;
  comingSoon?: boolean;
};

export type ControlPanelSection = {
  title: string;
  links: ControlPanelLink[];
};

export function buildControlPanelSections({
  includeAdmin = false,
  includeModerator = false,
}: {
  includeAdmin?: boolean;
  includeModerator?: boolean;
} = {}): ControlPanelSection[] {
  return [
    {
      title: "Home",
      links: [
        { label: "My Stream", href: "/home", mark: "MS" },
        { label: "My Pics", href: "/profile/gallery", mark: "MP" },
      ],
    },
    {
      title: "Production Zone",
      links: [{ label: "Production Zone", href: "/production-zone", mark: "PZ" }],
    },
    {
      title: "People",
      links: [
        { label: "Friends", href: "/friends", mark: "FR" },
        { label: "Groups", href: "/groups", mark: "GR" },
      ],
    },
    {
      title: "Communications",
      links: [
        { label: "Chat", href: "/messages", mark: "CH" },
        { label: "Mail", href: "/mail", mark: "ML" },
        { label: "Notifications", href: "/notifications", mark: "NO" },
        { label: "Alerts", href: "/alerts", mark: "AL" },
      ],
    },
    {
      title: "Settings",
      links: [
        { label: "Settings", href: "/settings", mark: "ST" },
        ...(includeModerator ? [{ label: "Moderator Dashboard", href: "/moderation", mark: "MD" }] : []),
        ...(includeAdmin ? [{ label: "Admin Portal", href: "/admin", mark: "AD" }] : []),
      ],
    },
  ];
}
