export type TutorialStep = {
  definitions?: TutorialIconDefinition[];
  description: string;
  id: string;
  page: string;
  section: string;
  target: string;
  title: string;
};

export type TutorialIconDefinition = {
  category: "NAVIGATION" | "STREAM";
  description: string;
  glyph?: string;
  iconSrc?: string;
  id: string;
  label: string;
};

export type TutorialSection = {
  description: string;
  id: string;
  stepIds: string[];
  title: string;
};

export const tutorialIconDefinitions: TutorialIconDefinition[] = [
  {
    id: "home",
    category: "NAVIGATION",
    label: "Home",
    description: "Opens your home stream.",
    iconSrc: "/assets/nav/nav-home.png"
  },
  {
    id: "gallery",
    category: "NAVIGATION",
    label: "My Pics",
    description: "Opens your personal picture gallery.",
    iconSrc: "/assets/nav/nav-gallery-v2.png"
  },
  {
    id: "market",
    category: "NAVIGATION",
    label: "Marketplace",
    description: "Opens the unified Marketplace from the top shortcut bar.",
    iconSrc: "/assets/nav/nav-market.png"
  },
  {
    id: "search",
    category: "NAVIGATION",
    label: "Search",
    description: "Searches Theta-Space.",
    iconSrc: "/assets/nav/nav-search.png"
  },
  {
    id: "comm-center",
    category: "NAVIGATION",
    label: "Messages",
    description: "Opens chat messages.",
    iconSrc: "/assets/nav/nav-comm.png"
  },
  {
    id: "theme",
    category: "NAVIGATION",
    label: "Theme",
    description: "Switches between the light and dark appearance.",
    glyph: "Theme"
  },
  {
    id: "notifications",
    category: "NAVIGATION",
    label: "Notifications",
    description: "Opens recent account and community updates.",
    glyph: "Bell"
  },
  {
    id: "alerts",
    category: "NAVIGATION",
    label: "Alerts",
    description: "Opens important platform or account notices.",
    glyph: "Alert"
  },
  {
    id: "admin",
    category: "NAVIGATION",
    label: "Admin",
    description: "Opens administrative tools when your account has access.",
    glyph: "A"
  },
  {
    id: "profile",
    category: "NAVIGATION",
    label: "Profile Picture",
    description: "Opens your profile.",
    glyph: "Profile"
  },
  {
    id: "react",
    category: "STREAM",
    label: "Reaction Triangle",
    description: "Opens the reaction choices for a post or comment.",
    iconSrc: "/assets/action-glyphs/action-react.png"
  },
  {
    id: "comment",
    category: "STREAM",
    label: "Comment Bubble",
    description: "Opens the discussion so you can add a comment.",
    iconSrc: "/assets/action-glyphs/action-comment.png"
  },
  {
    id: "share",
    category: "STREAM",
    label: "Share Arrow",
    description: "Passes a link or echoes a post to your stream.",
    iconSrc: "/assets/action-glyphs/action-share.png"
  },
  {
    id: "more",
    category: "STREAM",
    label: "Three Dots",
    description: "Opens additional options for the current item.",
    glyph: "..."
  },
  {
    id: "commend",
    category: "STREAM",
    label: "Commend",
    description: "Recognizes a helpful contribution.",
    glyph: "Commend"
  },
  {
    id: "report",
    category: "STREAM",
    label: "Report",
    description: "Sends the item to a person for review.",
    glyph: "Report"
  },
  {
    id: "attach-image",
    category: "STREAM",
    label: "Attach Image",
    description: "Adds a picture to the post or reply you are writing.",
    glyph: "Image"
  },
  {
    id: "send",
    category: "STREAM",
    label: "Send",
    description: "Submits the post, reply, or message you composed.",
    glyph: "Send"
  }
];

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
    title: "Top Shortcut Icons",
    description: "These icons are the fastest way to move around Theta-Space. Hover or focus an icon at any time to see its purpose.",
    page: "/home",
    target: "top-nav-home",
    definitions: tutorialIconDefinitions.filter((icon) => icon.category === "NAVIGATION")
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
    description: "Use these filters to switch between the newest member stream and posts shared with friends.",
    page: "/home",
    target: "stream-filters"
  },
  {
    id: "stream-icons",
    section: "stream",
    title: "Stream And Composer Icons",
    description: "These controls let you respond to posts, open more choices, attach a picture, or submit what you wrote.",
    page: "/home",
    target: "stream-action-icons",
    definitions: tutorialIconDefinitions.filter((icon) => icon.category === "STREAM")
  },
  {
    id: "comm-center",
    section: "communication",
    title: "Comm Center",
    description: "Comm Center is the hub for Comms, Contacts, and Groups. Use Comms for chat, Contacts for people you know, and Groups for groups you created or joined.",
    page: "/home",
    target: "control-comm-center"
  },
  {
    id: "people",
    section: "people-groups",
    title: "Contacts",
    description: "Contacts lives under Comm Center. It is where you search family, friends, acquaintances, and other saved contacts so you can chat or open their stream.",
    page: "/comm-center/contacts",
    target: "control-comm-center"
  },
  {
    id: "groups",
    section: "people-groups",
    title: "Groups",
    description: "Groups lives under Comm Center. It shows groups you created or joined, with links into each group space.",
    page: "/comm-center/groups",
    target: "control-comm-center"
  },
  {
    id: "market",
    section: "market",
    title: "Marketplace",
    description: "Marketplace is the main place to find or publish offers and wanted requests for goods, vehicles, rentals, services, jobs, and auditors.",
    page: "/marketplace",
    target: "control-marketplace"
  },
  {
    id: "listing-guides",
    section: "market",
    title: "Create Offers And Wanted Requests",
    description: "Choose Create Listing, select Offer or Wanted, then select the listing type. The wizard shows the fields needed for that exact kind of exchange.",
    page: "/marketplace",
    target: "control-marketplace"
  },
  {
    id: "auditors",
    section: "market",
    title: "Find Jobs And Auditors",
    description: "Jobs and auditor services are Marketplace listing types. Choose the matching type filter to narrow the same searchable directory.",
    page: "/marketplace",
    target: "control-marketplace"
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
    stepIds: ["stream-post", "stream-filters", "stream-icons"]
  },
  {
    id: "communication",
    title: "Communication",
    description: "Messages, notifications, and alerts.",
    stepIds: ["comm-center"]
  },
  {
    id: "people-groups",
    title: "Contacts And Groups",
    description: "Known contacts, family and friend connections, acquaintances, and groups.",
    stepIds: ["people", "groups"]
  },
  {
    id: "market",
    title: "Marketplace",
    description: "Offers, wanted requests, jobs, rentals, services, goods, vehicles, auditor discovery, and listing management.",
    stepIds: ["market", "listing-guides", "auditors"]
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
