import { AccountPurpose } from "@prisma/client";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { AdRailRotator } from "@/components/ads-credits/ad-rail-rotator";
import { AccountActorSwitcher } from "@/components/platform/account-actor-switcher";
import { AndroidAppControls } from "@/components/platform/android-app-controls";
import { DesktopCommandBar } from "@/components/platform/desktop-command-bar";
import { ShellCountsProvider } from "@/components/platform/shell-counts-provider";
import { TutorialTour } from "@/components/platform/tutorial-tour";
import { getAccountActorPicker } from "@/lib/platform/account-actor";
import { prisma } from "@/lib/platform/db";
import { isAdminRole } from "@/lib/platform/roles";
import { timeServerStep } from "@/lib/platform/server-timing";
import { getOnboardingState } from "@/modules/onboarding/onboarding.service";
import { isInternalMailEnabled } from "@/modules/mail/mail.service";
import { getUnreadCounts } from "@/modules/notifications-alerts/notifications-alerts.service";
import { getEffectivePolicyForUser } from "@/modules/membership-policy/membership-policy.service";
import { ActivityTracker } from "@/components/platform/activity-tracker";
import { ControlPanelNav, type NavSection } from "@/components/platform/control-panel-nav";
import { getWelcomeTutorialState } from "@/modules/tutorial/tutorial.service";
import { listRegisteredFeatureFlags } from "@/modules/feature-flags/feature-flags.service";

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

const exploreSection: NavSection = {
  href: "/market",
  label: "Market",
  items: [
    { label: "The Market", href: "/market" },
    { label: "Events", href: "/events" },
    { label: "Find a Job", href: "/jobs" },
    { label: "Find an Auditor", href: "/auditors" }
  ]
};

const advancedToolsSection: NavSection = {
  href: "/business-center",
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
    { label: "Feedback Center", href: "/settings/feedback" },
    { label: "Settings", href: "/settings" }
  ]
};

const AD_RAIL_DISABLED_PREFIXES = [
  "/admin",
  "/cutover",
  "/dev",
  "/docs",
  "/feedback",
  "/health",
  "/onboarding",
  "/secure-area"
];

const zeroCounts = { alerts: 0, mail: 0, messages: 0, notifications: 0 };

function shouldShowAdRail(currentPath: string, isSignedIn: boolean, isMobileAdRailRequest: boolean) {
  if (!isSignedIn || isMobileAdRailRequest) return false;
  return !AD_RAIL_DISABLED_PREFIXES.some((prefix) => currentPath === prefix || currentPath.startsWith(`${prefix}/`));
}

function getNavSections(input: {
  accountPurpose?: AccountPurpose;
  features: Record<string, boolean>;
  isAdmin: boolean;
  isSignedIn: boolean;
  mailEnabled: boolean;
  platformFeatures: Record<string, boolean>;
}): NavSection[] {
  if (!input.isSignedIn) {
    return [
      {
        label: "Home",
        href: "/membership",
        items: [{ label: "Membership", href: "/membership" }]
      },
      {
        label: "Account",
        href: "/login",
        items: [{ label: "Login", href: "/login" }]
      }
    ];
  }

  if (input.accountPurpose === AccountPurpose.AUDITOR_SEEKER) {
    return [
      {
        label: "Get Help",
        href: "/auditors",
        items: [
          { label: "Find an Auditor", href: "/auditors" },
          ...(input.mailEnabled ? [{ label: "Mail", href: "/mail", countKey: "mail" } as const] : []),
          { label: "Profile", href: "/profile" },
          { label: "Logout", action: "logout" }
        ]
      }
    ];
  }

  const visibleHomeSection = {
    ...homeSection,
    items: homeSection.items.filter((item) => item.href !== "/profile/gallery" || input.platformFeatures["media.personal_gallery"] !== false)
  };
  const visibleCommunicationItems = communicationsSection.items.filter((item) => {
    if (item.href === "/mail" || item.countKey === "mail") return input.mailEnabled;
    if (item.href === "/messages" || item.countKey === "messages") return input.platformFeatures["communication.direct_messages"] !== false;
    return true;
  });
  const visibleCommunicationsSection = {
    ...communicationsSection,
    href: visibleCommunicationItems[0]?.href ?? "/notifications",
    items: visibleCommunicationItems
  };
  const features = input.features;
  const marketItems = exploreSection.items.filter((item) => {
    if (item.href === "/market") return input.platformFeatures["marketplace.member_market"] !== false;
    if (item.href === "/auditors") return input.platformFeatures["directory.auditor_directory"] !== false;
    if (item.href === "/events") return input.isAdmin || features["events.create"] === true;
    if (item.href === "/jobs") return input.isAdmin || features["jobs.browse"] === true;
    return true;
  });
  const toolsItems = advancedToolsSection.items.filter((item) => {
    if (input.isAdmin) return true;
    if (item.href === "/business-center") {
      return features["market.storefront"] || features["org.profile"] || features["ads.createGeneral"];
    }
    if (item.href === "/ads") return features["ads.createGeneral"] || features["ads.createFundraiser"];
    if (item.href === "/writers-corner") return input.platformFeatures["publishing.writers_corner"] !== false && features["writers.access"];
    if (item.href === "/fundraisers") return features["fundraisers.create"];
    return false;
  });
  const visibleSettingsSection = {
    ...settingsSection,
    items: settingsSection.items.filter((item) => item.href !== "/settings/feedback" || input.platformFeatures["support.feedback_center"] !== false)
  };
  const memberSections = [visibleHomeSection, visibleCommunicationsSection, peopleSection];
  if (input.platformFeatures["community.groups"] !== false) memberSections.push(groupsSection);
  if (marketItems.length > 0) memberSections.push({ ...exploreSection, href: marketItems[0]?.href ?? "/market", items: marketItems });
  if (toolsItems.length > 0) {
    const toolsHref = toolsItems.some((item) => item.href === advancedToolsSection.href) ? advancedToolsSection.href : toolsItems[0]?.href;
    memberSections.push({ ...advancedToolsSection, href: toolsHref, items: toolsItems });
  }
  memberSections.push(visibleSettingsSection);

  const sections: NavSection[] = [
    ...memberSections,
    {
      label: "Admin",
      href: input.isAdmin ? "/admin" : undefined,
      items: input.isAdmin ? [{ label: "Admin Portal", href: "/admin" }] : []
    },
    {
      label: "Status",
      href: input.isAdmin ? "/health" : undefined,
      items: input.isAdmin
        ? [
            { label: "Dev Status", href: "/dev/status-page" },
            { label: "Health", href: "/health" },
            { label: "Cutover", href: "/cutover" },
            { label: "Docs", href: "/docs" },
            { label: "System Map", href: "/docs/system-map" }
          ]
        : []
    },
    {
      label: "Account",
      href: input.isSignedIn ? undefined : "/login",
      items: input.isSignedIn ? [] : [{ label: "Login", href: "/login" }]
    }
  ];

  return sections.filter((section) => section.items.length > 0);
}

function isAllowedAuditorSeekerPath(currentPath: string) {
  return ["/auditors", "/profile", "/settings/profile", "/api/profile"].some(
    (path) => currentPath === path || currentPath.startsWith(`${path}/`)
  );
}

async function getShellProfile(userId?: string) {
  if (!userId) return null;

  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      createdAt: true,
      profile: {
        select: {
          displayName: true,
          avatarUrl: true
        }
      }
    }
  });
}

function formatMemberSince(createdAt?: Date) {
  if (!createdAt) return "Member";

  return `Member since ${new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(createdAt)}`;
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function isAndroidAppRequest() {
  const requestHeaders = headers();
  const cookieStore = cookies();
  const userAgent = requestHeaders.get("user-agent") ?? "";
  const platformCookie = cookieStore.get("theta_platform")?.value ?? "";
  const platformHeader = requestHeaders.get("x-theta-platform") ?? "";

  return [
    userAgent,
    platformCookie,
    platformHeader,
    requestHeaders.get("x-requested-with") ?? "",
    requestHeaders.get("sec-ch-ua-platform") ?? "",
    requestHeaders.get("sec-ch-ua-model") ?? ""
  ].some((value) => /android|theta-space|thetaspace|webview|wv/i.test(value));
}

function isMobileBrowserRequest() {
  const requestHeaders = headers();
  const userAgent = requestHeaders.get("user-agent") ?? "";
  const mobileHint = requestHeaders.get("sec-ch-ua-mobile") ?? "";

  return mobileHint === "?1" || /\b(mobile|android|iphone|ipad|ipod|windows phone)\b/i.test(userAgent);
}

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await timeServerStep("shell.auth", auth());
  const isSignedIn = Boolean(session?.user && !session.user.revoked);
  const currentPath = headers().get("x-current-path") ?? "";
  const isOnboardingPath = currentPath.startsWith("/onboarding");
  const isAuditorSeeker = session?.user?.accountPurpose === AccountPurpose.AUDITOR_SEEKER;

  if (isSignedIn && isAuditorSeeker && currentPath && !isAllowedAuditorSeekerPath(currentPath)) {
    redirect("/auditors");
  }

  if (isSignedIn && session?.user?.id && !isOnboardingPath && !isAuditorSeeker) {
    const onboarding = await timeServerStep("shell.onboarding", getOnboardingState(session.user.id), { path: currentPath });

    if (onboarding?.nextPath) {
      redirect(onboarding.nextPath);
    }
  }

  const isAdmin = isAdminRole(session?.user?.role);
  const effectivePolicy = isSignedIn && session?.user?.id
    ? await timeServerStep("shell.policy", getEffectivePolicyForUser(session.user.id), { path: currentPath })
    : null;
  const tierFeatures: Record<string, boolean> = effectivePolicy?.features ?? {};
  const registeredFeatureFlags = await timeServerStep("shell.feature-flags", listRegisteredFeatureFlags(), { path: currentPath });
  const platformFeatures = Object.fromEntries(registeredFeatureFlags.map((flag) => [flag.key, flag.enabled]));
  const canCreateAd = isAdmin || tierFeatures["ads.createGeneral"] || tierFeatures["ads.createFundraiser"];
  const actorPicker = isSignedIn && session?.user?.id
    ? await timeServerStep("shell.actor-picker", getAccountActorPicker(session.user.id), { path: currentPath })
    : { activeActorUserId: "", activeKind: "PERSONAL" as const, actors: [] };
  const activeActorUserId = actorPicker.activeActorUserId || session?.user?.id;
  const mailEnabled = isInternalMailEnabled();
  const isAndroidApp = isAndroidAppRequest();
  const canSeeAdRail = isAdmin || tierFeatures["ads.createGeneral"] || tierFeatures["ads.createFundraiser"];
  const showAdRail = canSeeAdRail && shouldShowAdRail(currentPath, isSignedIn, isAndroidApp || isMobileBrowserRequest());
  const shellProfile = await timeServerStep("shell.profile", getShellProfile(activeActorUserId), { path: currentPath });
  const tutorialState = isSignedIn && session?.user?.id
    ? await timeServerStep("shell.tutorial", getWelcomeTutorialState(session.user.id), { path: currentPath })
    : { shouldPrompt: false };
  const counts = isSignedIn ? await timeServerStep("shell.counts", getUnreadCounts(session?.user?.id), { path: currentPath }) : zeroCounts;
  const navSections = getNavSections({ accountPurpose: session?.user?.accountPurpose, features: tierFeatures, isAdmin, isSignedIn, mailEnabled, platformFeatures });
  const displayName = shellProfile?.profile?.displayName ?? session?.user?.name ?? session?.user?.username ?? "Theta-Space";
  const memberSinceLabel = isSignedIn ? formatMemberSince(shellProfile?.createdAt) : "Private membership platform";

  return (
    <div className={["app-shell", isAndroidApp ? "is-android-app" : "", showAdRail ? "" : "no-ad-rail"].filter(Boolean).join(" ")}>
      <ShellCountsProvider enabled={isSignedIn} initialCounts={counts}>
      {isSignedIn ? <ActivityTracker /> : null}
      <DesktopCommandBar
        avatarUrl={shellProfile?.profile?.avatarUrl}
        canCreateAd={canCreateAd}
        counts={counts}
        displayName={displayName}
        isAdmin={isAdmin}
        isSignedIn={isSignedIn}
        platformFeatures={platformFeatures}
      />
      <aside className="side-nav">
        <div className="side-nav-profile" data-tutorial-target="shell-profile">
          <Link className="side-nav-avatar" data-tooltip={platformFeatures["media.personal_gallery"] === false ? "Open your profile." : "Open your gallery."} href={platformFeatures["media.personal_gallery"] === false ? "/profile" : "/profile/gallery"}>
            {shellProfile?.profile?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="" src={shellProfile.profile.avatarUrl} />
            ) : (
              <span>{initials(displayName)}</span>
            )}
          </Link>
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Theta-Space</p>
            <h1 className="mt-1 truncate text-xl font-semibold leading-tight">{displayName}</h1>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{memberSinceLabel}</p>
          </div>
        </div>
        {isSignedIn ? <AccountActorSwitcher activeActorUserId={actorPicker.activeActorUserId} actors={actorPicker.actors} /> : null}
        <ControlPanelNav counts={counts} sections={navSections} />
      </aside>
      <main aria-label="Main content" className="main-surface" tabIndex={0}>{children}</main>
      {showAdRail ? (
        <aside className="ad-rail">
          <section className="ad-rail-card">
            <div className="ad-rail-header">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Ad Stream</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Rotating paid placements on the right.</p>
              </div>
              {canCreateAd ? (
                <Link className="ad-rail-create-link" href="/ads/create">
                  Create ad
                </Link>
              ) : null}
            </div>
            <div className="mt-5 grid gap-3">
              <AdRailRotator initialAds={[]} isAdmin={isAdmin} />
            </div>
          </section>
        </aside>
      ) : null}
      {isAndroidApp && isSignedIn ? <AndroidAppControls counts={counts} mailEnabled={mailEnabled} platformFeatures={platformFeatures} sections={navSections} /> : null}
      {isSignedIn ? <TutorialTour shouldPromptOnFirstLogin={tutorialState.shouldPrompt} /> : null}
      </ShellCountsProvider>
    </div>
  );
}
