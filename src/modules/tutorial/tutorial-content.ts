export type TutorialStep = {
  description: string;
  id: string;
  page: string;
  section: string;
  target: string;
  title: string;
};

export type TutorialSection = {
  description: string;
  id: string;
  stepIds: string[];
  title: string;
};

export const tutorialSteps: TutorialStep[] = [
  {
    id: "identity",
    section: "getting-started",
    title: "Your Identity",
    description: "This is the account you are using right now. Your picture opens My Pics, and the name tells you whether you are posting as yourself or another allowed identity.",
    page: "/home",
    target: "shell-profile"
  },
  {
    id: "top-nav",
    section: "getting-started",
    title: "Top Shortcuts",
    description: "These icons are the fastest way to jump around Theta-Space. Home, My Pics, People, Market, Search, and Comm Center stay available while you browse.",
    page: "/home",
    target: "top-nav-home"
  },
  {
    id: "control-panel",
    section: "getting-started",
    title: "Control Panel",
    description: "The left control panel is the full menu. Use it when you want the named sections instead of the icon shortcuts.",
    page: "/home",
    target: "control-home"
  },
  {
    id: "stream-post",
    section: "stream",
    title: "Communicate",
    description: "Use this to create a stream post. Posts can include text, formatting, links, reactions, replies, shares, and pictures.",
    page: "/home",
    target: "stream-composer"
  },
  {
    id: "stream-filters",
    section: "stream",
    title: "Stream Filters",
    description: "Use these filters to switch between the newest public stream, friends, groups, and picture-focused browsing.",
    page: "/home",
    target: "stream-filters"
  },
  {
    id: "comm-center",
    section: "communication",
    title: "Comm Center",
    description: "Comm Center is where direct messages, notifications, and alerts live. Alerts are for platform or account-critical notices.",
    page: "/home",
    target: "control-comm-center"
  },
  {
    id: "people",
    section: "people-groups",
    title: "People",
    description: "People is where you browse members, visit profile pages, and manage friend or family connections.",
    page: "/people",
    target: "control-people"
  },
  {
    id: "groups",
    section: "people-groups",
    title: "Groups",
    description: "Groups collect members around a topic. Inside a group you can use posts, forums, and group media where enabled.",
    page: "/groups",
    target: "control-groups"
  },
  {
    id: "market",
    section: "market",
    title: "Market",
    description: "Market is where member listings appear. Open a listing to see details, seller information, and contact options.",
    page: "/market",
    target: "control-market"
  },
  {
    id: "gallery",
    section: "media",
    title: "My Pics",
    description: "My Pics is your gallery. Upload photos, set visibility, add tags, and choose avatar or banner images from here.",
    page: "/profile/gallery",
    target: "top-nav-gallery"
  },
  {
    id: "settings",
    section: "settings",
    title: "Settings",
    description: "Settings is where you manage profile areas, security, membership, notification rules, invites if available, and this Tutorial page.",
    page: "/settings",
    target: "control-settings"
  },
  {
    id: "tutorial-settings",
    section: "settings",
    title: "Tutorial Page",
    description: "Come back here whenever you want. You can restart the full walkthrough or jump straight to one section from the table of contents.",
    page: "/settings",
    target: "settings-tutorial-card"
  }
];

export const tutorialSections: TutorialSection[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    description: "Account identity, top shortcuts, and the main control panel.",
    stepIds: ["identity", "top-nav", "control-panel"]
  },
  {
    id: "stream",
    title: "Stream",
    description: "Posting, reacting, replying, and filtering the home stream.",
    stepIds: ["stream-post", "stream-filters"]
  },
  {
    id: "communication",
    title: "Communication",
    description: "Messages, notifications, and alerts.",
    stepIds: ["comm-center"]
  },
  {
    id: "people-groups",
    title: "People And Groups",
    description: "Member browsing, friend connections, family requests, and groups.",
    stepIds: ["people", "groups"]
  },
  {
    id: "market",
    title: "Market",
    description: "Member listings, listing details, and seller contact options.",
    stepIds: ["market"]
  },
  {
    id: "media",
    title: "Media",
    description: "Gallery photos, visibility, tags, avatars, and banners.",
    stepIds: ["gallery"]
  },
  {
    id: "settings",
    title: "Settings",
    description: "Account settings and replaying this tutorial.",
    stepIds: ["settings", "tutorial-settings"]
  }
];

export function getTutorialStep(stepId: string) {
  return tutorialSteps.find((step) => step.id === stepId) ?? tutorialSteps[0];
}
