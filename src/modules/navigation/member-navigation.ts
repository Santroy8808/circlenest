import { AccountPurpose } from "@prisma/client";
import type { NavSection } from "@/components/platform/control-panel-nav";

type MemberNavigationInput = {
  accountPurpose?: AccountPurpose;
  features: Record<string, boolean>;
  isAdmin: boolean;
  isSignedIn: boolean;
  mailEnabled: boolean;
  platformFeatures: Record<string, boolean>;
};

const homeSection: NavSection = {
  href: "/home",
  label: "Home",
  items: [
    { label: "My Stream", href: "/home" },
    { label: "My Pics", href: "/profile/gallery" },
    { label: "Search", href: "/search" },
    { label: "Logout", action: "logout" }
  ]
};

const communicationsSection: NavSection = {
  href: "/messages",
  label: "Comm Center",
  items: [
    { label: "Messages", href: "/messages", countKey: "messages" },
    { label: "Mail", href: "/mail", countKey: "mail" },
    { label: "Notifications", href: "/notifications", countKey: "notifications" },
    { label: "Alerts", href: "/notifications?view=alerts", countKey: "alerts" }
  ]
};

const peopleSection: NavSection = {
  href: "/people",
  label: "People",
  items: [
    { label: "Browse People", href: "/people" },
    { label: "Friends", href: "/friends" }
  ]
};

const groupsSection: NavSection = {
  href: "/groups",
  label: "Groups",
  items: [
    { label: "Browse Groups", href: "/groups" },
    { label: "Create Group", href: "/groups/create" }
  ]
};

const marketSection: NavSection = {
  href: "/market",
  label: "Market",
  items: [
    { label: "The Market", href: "/market" },
    { label: "Find a Job", href: "/jobs" },
    { label: "Find an Auditor", href: "/auditors" }
  ]
};

const toolsSection: NavSection = {
  label: "Tools",
  items: [
    { label: "Business Center", href: "/business-center" },
    { label: "Ads", href: "/ads" },
    { label: "Writers Corner", href: "/writers-corner" },
    { label: "Fundraisers", href: "/fundraisers" }
  ]
};

const settingsSection: NavSection = {
  href: "/settings",
  label: "Settings",
  items: [
    { label: "Profile", href: "/profile" },
    { label: "My Scientology", href: "/profile/scientology" },
    { label: "My Resume", href: "/settings/profile/resume" },
    { label: "Membership", href: "/membership" },
    { label: "Tutorial", href: "/settings/tutorial" },
    { label: "Users Manual", href: "/settings/users-manual" },
    { label: "Progression Path", href: "/settings/progression-path" },
    { label: "Feedback Center", href: "/settings/feedback" },
    { label: "Settings", href: "/settings" }
  ]
};

export function buildMemberNavigation(input: MemberNavigationInput): NavSection[] {
  if (!input.isSignedIn) {
    return [
      { label: "Home", href: "/membership", items: [{ label: "Membership", href: "/membership" }] },
      { label: "Account", href: "/login", items: [{ label: "Login", href: "/login" }] }
    ];
  }

  if (input.accountPurpose === AccountPurpose.AUDITOR_SEEKER) {
    return [{
      label: "Get Help",
      href: "/auditors",
      items: [
        { label: "Find an Auditor", href: "/auditors" },
        ...(input.mailEnabled ? [{ label: "Mail", href: "/mail", countKey: "mail" } as const] : []),
        { label: "Profile", href: "/profile" },
        { label: "Logout", action: "logout" }
      ]
    }];
  }

  const home = {
    ...homeSection,
    items: homeSection.items.filter(
      (item) => item.href !== "/profile/gallery" || input.platformFeatures["media.personal_gallery"] !== false
    )
  };
  const communicationItems = communicationsSection.items.filter((item) => {
    if (item.href === "/mail" || item.countKey === "mail") return input.mailEnabled;
    if (item.href === "/messages" || item.countKey === "messages") {
      return input.platformFeatures["communication.direct_messages"] !== false;
    }
    return true;
  });
  const communications = {
    ...communicationsSection,
    href: communicationItems[0]?.href ?? "/notifications",
    items: communicationItems
  };
  const marketItems = marketSection.items.filter((item) => {
    if (item.href === "/market") return input.platformFeatures["marketplace.member_market"] !== false;
    if (item.href === "/auditors") return input.platformFeatures["directory.auditor_directory"] !== false;
    if (item.href === "/jobs") return input.features["jobs.browse"] === true;
    return false;
  });
  const toolItems = toolsSection.items.filter((item) => {
    if (item.href === "/business-center") {
      return input.features["market.storefront"] || input.features["org.profile"];
    }
    if (item.href === "/ads") {
      return input.features["ads.createGeneral"] || input.features["ads.createFundraiser"];
    }
    if (item.href === "/writers-corner") {
      return input.platformFeatures["publishing.writers_corner"] !== false && input.features["writers.access"];
    }
    if (item.href === "/fundraisers") return input.features["fundraisers.create"] === true;
    return false;
  });
  const settings = {
    ...settingsSection,
    items: settingsSection.items.filter(
      (item) =>
        item.href !== "/settings/feedback" ||
        (input.platformFeatures["support.feedback_center"] !== false && input.features["support.createRequest"] === true)
    )
  };

  const memberSections: NavSection[] = [home, communications, peopleSection];
  if (input.platformFeatures["community.groups"] !== false) memberSections.push(groupsSection);
  if (marketItems.length > 0) {
    memberSections.push({ ...marketSection, href: marketItems[0]?.href ?? "/market", items: marketItems });
  }
  if (toolItems.length > 0) {
    memberSections.push({ ...toolsSection, href: toolItems[0]?.href, items: toolItems });
  }
  memberSections.push(settings);

  if (input.isAdmin) {
    memberSections.push(
      { label: "Admin", href: "/admin", items: [{ label: "Admin Portal", href: "/admin" }] },
      {
        label: "Status",
        href: "/health",
        items: [
          { label: "Dev Status", href: "/dev/status-page" },
          { label: "Health", href: "/health" },
          { label: "Cutover", href: "/cutover" },
          { label: "Docs", href: "/docs" },
          { label: "System Map", href: "/docs/system-map" }
        ]
      }
    );
  }

  return memberSections.filter((section) => section.items.length > 0);
}
