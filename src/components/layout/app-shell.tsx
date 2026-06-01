import Image from "next/image";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { MobileSwipeNav } from "@/components/layout/mobile-swipe-nav";
import { LogoutButton } from "@/components/layout/logout-button";
import { ensureBootstrapAdmins, isAdminUser } from "@/lib/auth/admin";

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

  try {
    await ensureBootstrapAdmins();

    if (userId) {
      const [loadedProfile, loadedCounts, loadedPref, loadedAdminAccess] = await Promise.all([
        prisma.profile.findUnique({ where: { userId }, select: { displayName: true, avatarUrl: true, bannerUrl: true } }),
        Promise.all([
          prisma.notification.count({ where: { userId, readAt: null } }),
          prisma.alert.count({ where: { userId, readAt: null } }),
          prisma.message.count({ where: { thread: { OR: [{ userAId: userId }, { userBId: userId }] }, readAt: null, senderId: { not: userId } } }),
          prisma.friendRequest.count({ where: { receiverId: userId, status: "PENDING" } }),
        ]),
        prisma.userFeedPreference.findUnique({ where: { userId }, select: { mobileNavSwipeSide: true } }),
        isAdminUser(userId),
      ]);

      profile = loadedProfile;
      [unreadNotifications, unreadAlerts, unreadMessages, pendingInvites] = loadedCounts;
      pref = loadedPref;
      adminAccess = loadedAdminAccess;
    }
  } catch (error) {
    console.error("[AppShell] fallback render", error);
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto hidden max-w-[1600px] grid-cols-[260px_minmax(0,1fr)] gap-6 p-3 min-[700px]:grid xl:grid-cols-[260px_minmax(0,1fr)_320px]">
        <aside className="card sticky top-3 h-[calc(100vh-1.5rem)] overflow-auto p-5">
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
            <Section
              title="Home"
              links={[
                ["Profile", "/profile/edit"],
                ["My Scientology", "/profile/scientology"],
                ["Resume", "/profile/resume"],
                ["Gallery", "/profile/gallery"],
              ]}
            />
            <Section title="Communications" links={[["Messages", "/messages"], ["Notifications", "/notifications"], ["Alerts", "/alerts"], ["Invites", "/friends#invites"]]} />
            <Section title="People" links={[["Friends", "/friends"], ["Groups", "/groups"], ["My Groups", "/groups?mine=1"]]} />
            <Section title="Production" links={[["Production Zone", "/production-zone"], ["Events", "/events"], ["Bazaar", "/bazaar"], ["Hiring Board", "/jobs"], ["Find an Auditor", "/auditors"], ["I'm an Auditor", "/auditors/im-an-auditor"]]} />
            {adminAccess ? <Section title="Admin" links={[["Admin Portal", "/admin"]]} /> : null}
            <Section title="Settings" links={[["Security", "/settings"], ["Theme", "/settings/theme"], ["My Rules", "/settings#rules"], ["Blocked Users", "/blocked-users"], ["My Subscription", "/settings#subscription"]]} />
          </nav>
          <div className="mt-4 border-t border-[var(--border)] pt-3">
            <LogoutButton />
          </div>
        </aside>

        <main className="space-y-3">
          <div className="mx-auto w-full max-w-[720px] space-y-2">
            <div className="relative h-56 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg)]">
              {profile?.bannerUrl ? <Image src={profile.bannerUrl} alt="Banner" width={1200} height={420} unoptimized className="h-full w-full object-cover" /> : <div className="h-full w-full bg-gradient-to-r from-[#1b2438] to-[#0b0e15]" />}
            </div>
            <div className="sticky top-0 z-30 bg-[var(--bg)]/98 pb-[10px] backdrop-blur">
              <header className="flex items-center justify-between gap-4 rounded-md bg-[var(--bg)] px-3 py-2 text-[13px] shadow-sm">
                <div className="flex flex-wrap items-center gap-4">
                  <Link href="/home" className="hover:underline">All</Link>
                  <Link href="/home" className="hover:underline">My Stream</Link>
                  <Link href="/friends" className="hover:underline">Friends</Link>
                  <Link href="/groups" className="hover:underline">Groups</Link>
                </div>
                <div className="flex items-center gap-4">
                  <Link href="/notifications?type=messages" className="hover:underline">{`\u{1F4AC}`} {unreadMessages}</Link>
                  <Link href="/notifications" className="hover:underline">{`\u{1F514}`} {unreadNotifications}</Link>
                  <Link href="/alerts" className="hover:underline">{`\u{26A0}\u{FE0F}`} {unreadAlerts}</Link>
                  <Link href="/friends#invites" className="hover:underline">{`\u{1F4E8}`} {pendingInvites}</Link>
                </div>
              </header>
            </div>
            <div className="pt-1">{children}</div>
          </div>
        </main>

        <aside className="card sticky top-3 hidden h-[calc(100vh-1.5rem)] overflow-auto p-4 text-sm xl:block">
          {rightSidebar ?? <p className="text-slate-400">Right panel reserved for ad stream and quick tools.</p>}
        </aside>
      </div>

      <div className="space-y-2 p-2 min-[700px]:hidden">{children}</div>
      <MobileSwipeNav side={pref?.mobileNavSwipeSide === "LEFT" ? "LEFT" : "RIGHT"} includeAdmin={adminAccess} />
    </div>
  );
}

function Section({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <section className="border-t border-[var(--border)] pt-2">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-strong)]">{title}</p>
      <div className="grid gap-1">
        {links.map(([label, href]) => (
          <Link key={href} href={href} className="text-[13px] text-slate-300 transition hover:translate-y-[-1px] hover:scale-[1.02] hover:text-white">
            {label}
          </Link>
        ))}
      </div>
    </section>
  );
}
