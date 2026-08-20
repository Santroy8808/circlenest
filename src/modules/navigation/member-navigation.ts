import { AccountPurpose } from "@prisma/client";
import type { NavSection } from "@/components/platform/control-panel-nav";
import { myScientologyVisible } from "@/modules/my-scientology/visibility";

type MemberNavigationInput = {
  accountPurpose?: AccountPurpose;
  features: Record<string, boolean>;
  isAdmin: boolean;
  isSignedIn: boolean;
  mailEnabled: boolean;
  platformFeatures: Record<string, boolean>;
  defaultHomeHref?: string;
  showNewUpgradeItems?: boolean;
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
  href: "/comm-center",
  label: "Comm Center",
  items: [
    { label: "Chat", href: "/messages", countKey: "messages" },
    { label: "People", href: "/people" },
    { label: "Groups", href: "/groups" }
  ]
};

const jobsMarketSection: NavSection = {
  href: "/market",
  label: "Jobs & Market",
  items: [
    { label: "The Market", href: "/market" },
    { label: "Jobs", href: "/jobs" }
  ]
};

const focusedMarketplaceSection: NavSection = {
  href: "/marketplace",
  label: "Marketplace",
  items: [
    { label: "Browse All", href: "/marketplace" },
    { label: "Offers", href: "/marketplace?intent=OFFER" },
    { label: "Wanted", href: "/marketplace?intent=WANTED" },
    { label: "Jobs", href: "/marketplace?kind=JOB" },
    { label: "Rentals", href: "/marketplace?kind=RENTAL" },
    { label: "Services", href: "/marketplace?kind=SERVICE" },
    { label: "Find an Auditor", href: "/auditors" },
    { label: "Saved", href: "/marketplace/saved" },
    { label: "My Exchanges", href: "/marketplace/interactions" },
    { label: "My Listings", href: "/marketplace/manage" },
    { label: "Create Listing", href: "/marketplace/new" }
  ]
};

const auditorSection: NavSection = {
  href: "/auditors",
  label: "Find an Auditor",
  items: [
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
    ...(myScientologyVisible ? [{ label: "My Scientology", href: "/profile/scientology" }] : []),
    { label: "My Resume", href: "/settings/profile/resume" },
    { label: "Membership", href: "/membership" },
    { label: "Default Home", href: "/settings/default-home" },
    { label: "Progression Path", href: "/settings/progression-path" },
    { label: "Invite Someone!", href: "/settings/invite" },
    { label: "Settings", href: "/settings" }
  ]
};

const tutorialSection: NavSection = {
  href: "/settings/tutorial",
  label: "Tutorial",
  items: [
    { label: "Guided Tutorial", href: "/settings/tutorial" },
    { label: "Users Manual", href: "/settings/users-manual" }
  ]
};

export function buildMemberNavigation(input: MemberNavigationInput): NavSection[] {
  const marketplaceFocused = input.platformFeatures["marketplace.focused_rollout"] === true;
  if (!input.isSignedIn) {
    if (marketplaceFocused) {
      return [
        { label: "Marketplace", href: "/marketplace", items: [{ label: "Browse Listings", href: "/marketplace" }] },
        { label: "Account", href: "/login", items: [{ label: "Login", href: "/login" }, { label: "Sign Up", href: "/signup" }] }
      ];
    }
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
    href: input.defaultHomeHref ?? homeSection.href,
    items: homeSection.items.filter(
      (item) => item.href !== "/profile/gallery" || input.platformFeatures["media.personal_gallery"] !== false
    )
  };
  const communicationItems = communicationsSection.items.filter((item) => {
    if (item.href === "/messages" || item.countKey === "messages") {
      return input.platformFeatures["communication.direct_messages"] !== false;
    }
    if (item.href === "/groups") {
      return input.platformFeatures["community.groups"] !== false;
    }
    return true;
  });
  const communications = {
    ...communicationsSection,
    href: "/comm-center",
    items: communicationItems
  };
  const jobsMarketItems = jobsMarketSection.items.filter((item) => {
    if (item.href === "/market") return input.platformFeatures["marketplace.member_market"] !== false;
    if (item.href === "/jobs") return input.features["jobs.browse"] === true;
    return false;
  });
  const showAuditorDirectory = input.platformFeatures["directory.auditor_directory"] !== false;
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
  }).map((item) => ({
    ...item,
    isNewlyUnlocked: Boolean(input.showNewUpgradeItems && item.href === "/writers-corner")
  }));
  const singleInvitesEnabled = input.platformFeatures["membership.single_invites"] !== false;
  const bulkInvitesEnabled = input.platformFeatures["membership.bulk_invites"] !== false;
  const settings = {
    ...settingsSection,
    items: settingsSection.items.filter((item) => {
      if (item.href !== "/settings/invite") return true;
      if (input.isAdmin) return singleInvitesEnabled || bulkInvitesEnabled;
      return (singleInvitesEnabled && input.features["invites.send"] === true)
        || (bulkInvitesEnabled && input.features["invites.bulkSend"] === true);
    })
  };

  const memberSections: NavSection[] = [home, communications];
  if (marketplaceFocused) {
    const community = {
      ...home,
      label: "Community",
      href: "/home",
      items: home.items.filter((item) => item.action !== "logout")
    };
    const focusedSections: NavSection[] = [focusedMarketplaceSection, communications, community];
    if (toolItems.length > 0) {
      focusedSections.push({ ...toolsSection, href: toolItems[0]?.href, items: toolItems });
    }
    focusedSections.push(tutorialSection, settings);
    if (input.isAdmin) {
      focusedSections.push(
        { label: "Admin", href: "/admin", items: [{ label: "Admin Portal", href: "/admin" }] },
        { label: "Account", href: "/settings", items: [{ label: "Logout", action: "logout" }] }
      );
    } else {
      focusedSections.push({ label: "Account", href: "/settings", items: [{ label: "Logout", action: "logout" }] });
    }
    return focusedSections.filter((section) => section.items.length > 0);
  }
  if (jobsMarketItems.length > 0) {
    memberSections.push({ ...jobsMarketSection, href: jobsMarketItems[0]?.href ?? "/market", items: jobsMarketItems });
  }
  if (showAuditorDirectory) {
    memberSections.push(auditorSection);
  }
  if (toolItems.length > 0) {
    memberSections.push({
      ...toolsSection,
      href: toolItems[0]?.href,
      isNewlyUnlocked: toolItems.some((item) => item.isNewlyUnlocked),
      items: toolItems
    });
  }
  memberSections.push(tutorialSection, settings);

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
