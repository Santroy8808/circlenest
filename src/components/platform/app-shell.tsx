import { AdPlacement, MembershipTier, UserRole } from "@prisma/client";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdRailRotator } from "@/components/ads-credits/ad-rail-rotator";
import { AndroidAppControls } from "@/components/platform/android-app-controls";
import { prisma } from "@/lib/platform/db";
import { getAdPlacementPool } from "@/modules/ads-credits/ads-credits.service";
import { getUnreadCounts } from "@/modules/notifications-alerts/notifications-alerts.service";
import { getOnboardingState } from "@/modules/onboarding/onboarding.service";
import { ActivityTracker } from "@/components/platform/activity-tracker";
import { ControlPanelNav, type NavSection } from "@/components/platform/control-panel-nav";

const homeSection: NavSection = {
  label: "Home",
  items: [
    { label: "My Stream", href: "/home" },
    { label: "My Pics", href: "/profile/gallery" },
    { label: "Search", href: "/search" },
    { label: "Membership", href: "/membership" },
    { label: "Logout", action: "logout" }
  ]
};

const communicationsSection: NavSection = {
  label: "Communications",
  items: [
    { label: "Messages", href: "/messages", countKey: "messages" },
    { label: "Mail", href: "/mail", countKey: "mail" },
    { label: "Notifications", href: "/notifications", countKey: "notifications" },
    { label: "Alerts", href: "/alerts", countKey: "alerts" }
  ]
};

const peopleSection: NavSection = {
  label: "People",
  items: [
    { label: "Browse People", href: "/people" },
    { label: "Friends", href: "/friends" },
    { label: "Groups", href: "/groups" }
  ]
};

const productionZoneSection: NavSection = {
  label: "Production Zone",
  items: [
    { label: "Events", href: "/events" },
    { label: "The Market", href: "/market" },
    { label: "Find a Job", href: "/jobs" },
    { label: "Find an Auditor", href: "/auditors" },
    { label: "Writers Corner", href: "/writers-corner" },
    { label: "Fundraisers", href: "/fundraisers" },
    { label: "Business Center", href: "/business-center" },
    { label: "Ads", href: "/ads" }
  ]
};

const settingsSection: NavSection = {
  label: "Settings",
  items: [
    { label: "Profile", href: "/profile" },
    { label: "My Scientology", href: "/profile/scientology" },
    { label: "Settings", href: "/settings" }
  ]
};

function getNavSections(input: {
  isAdmin: boolean;
  isBusinessAccount: boolean;
  isSignedIn: boolean;
}): NavSection[] {
  if (!input.isSignedIn) {
    return [
      {
        label: "Home",
        items: [{ label: "Membership", href: "/membership" }]
      },
      {
        label: "Account",
        items: [{ label: "Login", href: "/login" }]
      }
    ];
  }

  const memberSections = input.isBusinessAccount
    ? [homeSection, communicationsSection, productionZoneSection, peopleSection, settingsSection]
    : [homeSection, communicationsSection, peopleSection, productionZoneSection, settingsSection];

  const sections: NavSection[] = [
    ...memberSections,
    {
      label: "Admin",
      items: input.isAdmin ? [{ label: "Admin Portal", href: "/admin" }] : []
    },
    {
      label: "Status",
      items: input.isAdmin
        ? [
            { label: "Dev Status", href: "/" },
            { label: "Health", href: "/health" },
            { label: "Cutover", href: "/cutover" },
            { label: "Docs", href: "/docs" },
            { label: "System Map", href: "/docs/system-map" }
          ]
        : []
    },
    {
      label: "Account",
      items: input.isSignedIn ? [] : [{ label: "Login", href: "/login" }]
    }
  ];

  return sections.filter((section) => section.items.length > 0);
}

async function getRightStreamAds(isSignedIn: boolean, viewerUserId?: string) {
  if (!isSignedIn) return [];

  return getAdPlacementPool({
    viewerUserId,
    placement: AdPlacement.RIGHT_STREAM,
    limit: 16
  });
}

async function getShellProfile(userId?: string) {
  if (!userId) return null;

  return prisma.profile.findUnique({
    where: { userId },
    select: {
      displayName: true,
      avatarUrl: true
    }
  });
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

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const isSignedIn = Boolean(session?.user && !session.user.revoked);
  const currentPath = headers().get("x-current-path") ?? "";
  const isOnboardingPath = currentPath.startsWith("/onboarding");

  if (isSignedIn && session?.user?.id && !isOnboardingPath) {
    const onboarding = await getOnboardingState(session.user.id);

    if (onboarding?.nextPath) {
      redirect(onboarding.nextPath);
    }
  }

  const isAdmin = session?.user?.role === UserRole.ADMIN;
  const isBusinessAccount = session?.user?.tier === MembershipTier.PROFESSIONAL;
  const [counts, rightStreamAds, shellProfile] = await Promise.all([
    getUnreadCounts(session?.user?.id),
    getRightStreamAds(isSignedIn, session?.user?.id),
    getShellProfile(session?.user?.id)
  ]);
  const navSections = getNavSections({ isAdmin, isBusinessAccount, isSignedIn });
  const displayName = shellProfile?.displayName ?? session?.user?.name ?? session?.user?.username ?? "Theta-Space";
  const isAndroidApp = isAndroidAppRequest();

  return (
    <div className={isAndroidApp ? "app-shell is-android-app" : "app-shell"}>
      {isSignedIn ? <ActivityTracker /> : null}
      <aside className="side-nav">
        <div className="side-nav-profile">
          <div className="side-nav-avatar">
            {shellProfile?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="" src={shellProfile.avatarUrl} />
            ) : (
              <span>{initials(displayName)}</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Theta-Space</p>
            <h1 className="mt-1 truncate text-xl font-semibold leading-tight">{displayName}</h1>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{isSignedIn ? "Member control panel" : "Private membership platform"}</p>
          </div>
        </div>
        <ControlPanelNav counts={counts} sections={navSections} />
        <div className="mt-8 rounded-md border border-[var(--line)] bg-black/16 p-3 text-xs leading-5 text-[var(--muted)]">
          {isAdmin ? "Production source remains untouched until cutover and rollback archive are ready." : "Theta-Space member controls."}
        </div>
      </aside>
      <main className="main-surface">{children}</main>
      <aside className="ad-rail">
        <section className="ad-rail-card">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Ad Stream</p>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Rotating paid placements on the right.</p>
          <div className="mt-5 grid gap-3">
            <AdRailRotator initialAds={rightStreamAds} />
          </div>
        </section>
      </aside>
      {isAndroidApp && isSignedIn ? <AndroidAppControls counts={counts} sections={navSections} /> : null}
    </div>
  );
}
