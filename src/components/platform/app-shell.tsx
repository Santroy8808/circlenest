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
import { WebSessionGuard } from "@/components/platform/web-session-guard";
import { getAccountActorPicker } from "@/lib/platform/account-actor";
import { prisma } from "@/lib/platform/db";
import { isAdminRole } from "@/lib/platform/roles";
import { timeServerStep } from "@/lib/platform/server-timing";
import { getOnboardingState } from "@/modules/onboarding/onboarding.service";
import { isInternalMailEnabled } from "@/modules/mail/mail.service";
import { getUnreadCounts } from "@/modules/notifications-alerts/notifications-alerts.service";
import { getEffectivePolicyForUser } from "@/modules/membership-policy/membership-policy.service";
import { ActivityTracker } from "@/components/platform/activity-tracker";
import { ControlPanelNav } from "@/components/platform/control-panel-nav";
import { avatarImageStyle } from "@/modules/profile-identity/avatar-frame";
import { getWelcomeTutorialState } from "@/modules/tutorial/tutorial.service";
import { listRegisteredFeatureFlags } from "@/modules/feature-flags/feature-flags.service";
import { buildMemberNavigation } from "@/modules/navigation/member-navigation";
import { getDefaultHomeHref } from "@/modules/home-preferences/default-home-preferences.service";

const zeroCounts = { alerts: 0, mail: 0, messages: 0, notifications: 0 };
type ThemeMode = "dark" | "light";

function shouldShowAdRail(isSignedIn: boolean, isMobileAdRailRequest: boolean) {
  if (!isSignedIn || isMobileAdRailRequest) return false;
  return true;
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
          avatarUrl: true,
          avatarFocalX: true,
          avatarFocalY: true,
          avatarZoom: true,
          avatarFrameShape: true,
          theme: true
        }
      }
    }
  });
}

function getPreferredThemeMode(theme: unknown): ThemeMode {
  if (!theme || typeof theme !== "object" || Array.isArray(theme)) return "dark";
  const value = (theme as { defaultMode?: unknown }).defaultMode;
  return value === "light" ? "light" : "dark";
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

async function isAndroidAppRequest() {
  const [requestHeaders, cookieStore] = await Promise.all([headers(), cookies()]);
  const userAgent = requestHeaders.get("user-agent") ?? "";
  const platformCookie = cookieStore.get("theta_platform")?.value ?? "";
  const platformHeader = requestHeaders.get("x-theta-platform") ?? "";

  const explicitAppMarker = [
    platformCookie,
    platformHeader,
    requestHeaders.get("x-requested-with") ?? ""
  ].some((value) => /android|theta-space|thetaspace/i.test(value));

  return explicitAppMarker || /theta-space|thetaspace|webview|\bwv\b/i.test(userAgent);
}

async function isMobileBrowserRequest() {
  const requestHeaders = await headers();
  const userAgent = requestHeaders.get("user-agent") ?? "";
  const mobileHint = requestHeaders.get("sec-ch-ua-mobile") ?? "";

  return mobileHint === "?1" || /\b(mobile|android|iphone|ipad|ipod|windows phone)\b/i.test(userAgent);
}

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await timeServerStep("shell.auth", auth());
  const isSignedIn = Boolean(session?.user && !session.user.revoked);
  const currentPath = (await headers()).get("x-current-path") ?? "";
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
  const canCreateAd = Boolean(tierFeatures["ads.createGeneral"] || tierFeatures["ads.createFundraiser"]);
  const actorPicker = isSignedIn && session?.user?.id
    ? await timeServerStep("shell.actor-picker", getAccountActorPicker(session.user.id), { path: currentPath })
    : { activeActorUserId: "", activeKind: "PERSONAL" as const, actors: [] };
  const activeActorUserId = actorPicker.activeActorUserId || session?.user?.id;
  const mailEnabled = isInternalMailEnabled();
  const defaultHomeHref = isSignedIn && session?.user?.id
    ? await timeServerStep("shell.default-home", getDefaultHomeHref(session.user.id, {
        accountPurpose: session.user.accountPurpose,
        features: tierFeatures,
        isAdmin,
        mailEnabled,
        platformFeatures
      }), { path: currentPath })
    : "/home";
  const isAndroidApp = await isAndroidAppRequest();
  const showAdRail =
    shouldShowAdRail(isSignedIn, isAndroidApp || (await isMobileBrowserRequest()));
  const shellProfile = await timeServerStep("shell.profile", getShellProfile(activeActorUserId), { path: currentPath });
  const tutorialState = isSignedIn && session?.user?.id
    ? await timeServerStep("shell.tutorial", getWelcomeTutorialState(session.user.id), { path: currentPath })
    : { shouldPrompt: false };
  const counts = isSignedIn ? await timeServerStep("shell.counts", getUnreadCounts(session?.user?.id), { path: currentPath }) : zeroCounts;
  const navSections = buildMemberNavigation({ accountPurpose: session?.user?.accountPurpose, defaultHomeHref, features: tierFeatures, isAdmin, isSignedIn, mailEnabled, platformFeatures });
  const displayName = shellProfile?.profile?.displayName ?? session?.user?.name ?? session?.user?.username ?? "Theta-Space";
  const memberSinceLabel = isSignedIn ? formatMemberSince(shellProfile?.createdAt) : "Private membership platform";
  const preferredThemeMode = getPreferredThemeMode(shellProfile?.profile?.theme);

  return (
    <div className={["app-shell", isAndroidApp ? "is-android-app" : "", showAdRail ? "" : "no-ad-rail"].filter(Boolean).join(" ")}>
      <ShellCountsProvider enabled={isSignedIn} initialCounts={counts}>
      <WebSessionGuard enabled={isSignedIn && !isAndroidApp} isAdmin={isAdmin} />
      {isSignedIn ? <ActivityTracker /> : null}
      <DesktopCommandBar
        avatarFocalX={shellProfile?.profile?.avatarFocalX}
        avatarFocalY={shellProfile?.profile?.avatarFocalY}
        avatarFrameShape={shellProfile?.profile?.avatarFrameShape}
        avatarZoom={shellProfile?.profile?.avatarZoom}
        avatarUrl={shellProfile?.profile?.avatarUrl}
        canCreateAd={canCreateAd}
        counts={counts}
        displayName={displayName}
        defaultHomeHref={defaultHomeHref}
        initialThemeMode={preferredThemeMode}
        isAdmin={isAdmin}
        isSignedIn={isSignedIn}
        platformFeatures={platformFeatures}
      />
      <aside className="side-nav">
        <div className="side-nav-profile" data-tutorial-target="shell-profile">
          <Link className="side-nav-avatar" data-tooltip="Open your profile." href="/profile">
            {shellProfile?.profile?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="" src={shellProfile.profile.avatarUrl} style={avatarImageStyle(shellProfile.profile)} />
            ) : (
              <span>{initials(displayName)}</span>
            )}
          </Link>
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Theta-Space</p>
            <h1 className="mt-1 truncate text-xl font-semibold leading-tight">
              <Link className="profile-inline-link" data-tooltip="Open your profile." href="/profile">
                {displayName}
              </Link>
            </h1>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{memberSinceLabel}</p>
          </div>
        </div>
        {isSignedIn ? <AccountActorSwitcher activeActorUserId={actorPicker.activeActorUserId} actors={actorPicker.actors} /> : null}
        <ControlPanelNav counts={counts} sections={navSections} />
      </aside>
      <main aria-label="Main content" className="main-surface" tabIndex={0}>
        <div className="main-content-frame">{children}</div>
      </main>
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
      {isAndroidApp && isSignedIn ? <AndroidAppControls counts={counts} defaultHomeHref={defaultHomeHref} mailEnabled={mailEnabled} platformFeatures={platformFeatures} sections={navSections} /> : null}
      {isSignedIn ? <TutorialTour shouldPromptOnFirstLogin={!isOnboardingPath && tutorialState.shouldPrompt} /> : null}
      </ShellCountsProvider>
    </div>
  );
}
