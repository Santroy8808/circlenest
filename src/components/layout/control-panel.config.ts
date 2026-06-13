export type ControlPanelLink = {
  label: string;
  href: string;
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
        { label: "My Stream", href: "/home" },
        { label: "My Pics", href: "/profile/gallery" },
      ],
    },
    {
      title: "Production Zone",
      links: [{ label: "Production Zone", href: "/production-zone" }],
    },
    {
      title: "People",
      links: [
        { label: "Friends", href: "/friends" },
        { label: "Groups", href: "/groups" },
      ],
    },
    {
      title: "Communications",
      links: [
        { label: "Messages", href: "/messages" },
        { label: "Notifications", href: "/notifications" },
        { label: "Alerts", href: "/alerts" },
      ],
    },
    {
      title: "Settings",
      links: [
        { label: "Settings", href: "/settings" },
        ...(includeModerator ? [{ label: "Moderator Dashboard", href: "/moderation" }] : []),
        ...(includeAdmin ? [{ label: "Admin Portal", href: "/admin" }] : []),
      ],
    },
  ];
}

