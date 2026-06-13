import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AdStreamSidebar } from "@/components/ads/ad-stream-sidebar";
import { AdminModeSessionClient } from "@/components/security/admin-mode-session-client";
import { MobileSwipeNav } from "@/components/layout/mobile-swipe-nav";
import { LogoutButton } from "@/components/layout/logout-button";
import { ensureBootstrapAdmins, isAdminUser, isSiteModeratorUser } from "@/lib/auth/admin";
import { ADMIN_MODE_COOKIE_NAME, hasAdminModeAccess } from "@/lib/security/admin-mode";
import { CURRENT_TERMS_VERSION } from "@/lib/security/terms";
import { TermsGateClient } from "@/components/security/terms-gate-client";
import { GlobalChatDock } from "@/components/messages/global-chat-dock";
import { buildControlPanelSections } from "@/components/layout/control-panel.config";
import { ControlPanelSection } from "@/components/layout/control-panel-section";

export async function AppShell({ children, rightSidebar }: { children: React.ReactNode; rightSidebar?: React.ReactNode }) {
  const session = await auth();
  const userId = session?.user?.id;
  let profile: { displayName: string | null; avatarUrl: string | null; bannerUrl: string | null } | null = null;
  let unreadNotifications = 0;
  let unreadAlerts = 0;
  let unreadMessages = 0;
  let pendingInvites = 0;
  let pref: { mobileNavSwipeSide: string | null } | null = null;
  let adminAccess = false;
  let moderatorAccess = false;
  let needsTermsAcceptance = false;
  let adminAnnouncement: { id: string; body: string; targetUrl: string | null; createdAt: Date } | null = null;

  try {
    await ensureBootstrapAdmins();

    if (userId) {
      const [loadedProfile, loadedCounts, loadedPref, loadedAdminAccess, loadedModeratorAccess, loadedTerms] = await Promise.all([
        prisma.profile.findUnique({ where: { userId }, select: { displayName: true, avatarUrl: true, bannerUrl: true } }),
        Promise.all([
          prisma.notification.count({ where: { userId, readAt: null } }),
          prisma.alert.count({ where: { userId, readAt: null } }),
          prisma.message.count({ where: { thread: { OR: [{ userAId: userId }, { userBId: userId }] }, readAt: null, senderId: { not: userId } } }),
          prisma.friendRequest.count({ where: { receiverId: userId, status: "PENDING" } }),
        ]),
        prisma.userFeedPreference.findUnique({ where: { userId }, select: { mobileNavSwipeSide: true } }),
        isAdminUser(userId),
        isSiteModeratorUser(userId),
        prisma.user.findUnique({ where: { id: userId }, select: { acceptedTermsVersion: true } }),
      ]);

      profile = loadedProfile;
      [unreadNotifications, unreadAlerts, unreadMessages, pendingInvites] = loadedCounts;
      pref = loadedPref;
      adminAccess = loadedAdminAccess;
      moderatorAccess = loadedModeratorAccess;
      needsTermsAcceptance = loadedTerms?.acceptedTermsVersion !== CURRENT_TERMS_VERSION;
      adminAnnouncement = await prisma.notification.findFirst({
        where: { userId, readAt: null, type: "ADMIN_ANNOUNCEMENT" },
        select: { id: true, body: true, targetUrl: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      });
    }
  } catch (error) {
    console.error("[AppShell] fallback render", error);
  }

  const adminModeToken = userId ? cookies().get(ADMIN_MODE_COOKIE_NAME)?.value : null;
  const adminModeActive = Boolean(userId && adminAccess && hasAdminModeAccess(userId, adminModeToken));
  const showAdminFeatures = adminAccess && adminModeActive;
  const showModeratorFeatures = moderatorAccess && (!adminAccess || adminModeActive);
  const controlPanelSections = buildControlPanelSections({
    includeAdmin: showAdminFeatures,
    includeModerator: showModeratorFeatures,
  });

  return (
    <div className="min-h-screen">
      <TermsGateClient needsAcceptance={needsTermsAcceptance} />
      {adminModeActive ? <AdminModeSessionClient /> : null}
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-6 p-3 min-[700px]:grid min-[700px]:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_320px]">
        <aside className="card sticky top-3 hidden h-[calc(100vh-1.5rem)] overflow-auto p-5 min-[700px]:block">
          <div className="mb-4 flex items-start gap-3">
            <div className="relative h-[7.5rem] w-[7.5rem] overflow-hidden rounded-md border border-[var(--border)]">
              {profile?.avatarUrl ? <Image src={profile.avatarUrl} alt="Avatar" width={160} height={160} unoptimized className="h-full w-full object-cover" /> : <div className="h-full w-full bg-[#222b3d]" />}
            </div>
            <div>
              <p className="text-[16px] font-semibold text-[var(--text-strong)]">Theta-Space</p>
              <Link href="/home" className="text-sm text-slate-300 hover:underline">My Stream</Link>
            </div>
          </div>

          <nav className="space-y-3 text-xs">
            {controlPanelSections.map((section) => (
              <ControlPanelSection key={section.title} title={section.title} links={section.links} />
            ))}
          </nav>
          <div className="mt-4 border-t border-[var(--border)] pt-3">
            <LogoutButton />
          </div>
        </aside>

        <main className="min-w-0 space-y-3">
          <div className="mx-auto w-full max-w-[720px] space-y-2">
            {adminAnnouncement ? (
              <div className="rounded border border-amber-300/40 bg-amber-300/10 p-3 text-sm text-amber-100">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200">Admin announcement</p>
                    <p className="mt-1 whitespace-pre-wrap">{adminAnnouncement.body}</p>
                  </div>
                  <Link href={`/notifications/open?id=${encodeURIComponent(adminAnnouncement.id)}`} className="rounded border border-amber-200/40 px-3 py-1.5 text-xs font-semibold text-amber-50 hover:bg-amber-200/10">
                    Open
                  </Link>
                </div>
              </div>
            ) : null}
            <div className="relative hidden h-56 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg)] min-[700px]:block">
              {profile?.bannerUrl ? <Image src={profile.bannerUrl} alt="Banner" width={1200} height={420} unoptimized className="h-full w-full object-cover" /> : <div className="h-full w-full bg-gradient-to-r from-[#1b2438] to-[#0b0e15]" />}
            </div>
            <div className="sticky top-0 z-30 hidden bg-[var(--bg)]/98 pb-[10px] backdrop-blur min-[700px]:block">
              <header className="flex items-center justify-between gap-4 rounded-md bg-[var(--bg)] px-3 py-2 text-[13px] shadow-sm">
                <div className="flex flex-wrap items-center gap-4">
                  <Link href="/home" className="hover:underline">All</Link>
                  <Link href="/home" className="hover:underline">My Stream</Link>
                  <Link href="/friends" className="hover:underline">Friends</Link>
                  <Link href="/groups" className="hover:underline">Groups</Link>
                </div>
                <div className="flex items-center gap-4">
                  <Link href="/notifications?type=messages" title="Unread messages" aria-label={`${unreadMessages} unread messages`} className="hover:underline">Messages {unreadMessages}</Link>
                  <Link href="/notifications" title="Unread notifications" aria-label={`${unreadNotifications} unread notifications`} className="hover:underline">Notifications {unreadNotifications}</Link>
                  <Link href="/alerts" title="Unread alerts" aria-label={`${unreadAlerts} unread alerts`} className="hover:underline">Alerts {unreadAlerts}</Link>
                  <Link href="/friends#invites" title="Pending friend requests" aria-label={`${pendingInvites} pending friend requests`} className="hover:underline">Invites {pendingInvites}</Link>
                </div>
              </header>
            </div>
            <div className="pt-1">{children}</div>
          </div>
        </main>

        <aside className="card sticky top-3 hidden h-[calc(100vh-1.5rem)] overflow-auto p-4 text-sm xl:block">
          {rightSidebar ?? <AdStreamSidebar />}
        </aside>
      </div>
      {userId ? <GlobalChatDock myUserId={userId} /> : null}
      <MobileSwipeNav
        side={pref?.mobileNavSwipeSide === "LEFT" ? "LEFT" : "RIGHT"}
        includeAdmin={showAdminFeatures}
        includeModerator={showModeratorFeatures}
      />
    </div>
  );
}
